import { Audio, type AVPlaybackStatus, type RecordingStatus } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';

export type RepeaterPhase = 'idle' | 'listening' | 'recording' | 'playback' | 'denied' | 'error';

const START_THRESHOLD_DB = -35;
const SILENCE_THRESHOLD_DB = -45;
const SILENCE_HOLD_MS = 1000;
const STATUS_UPDATE_MS = 100;
const MAX_IDLE_RECORDING_MS = 10000;
const PLAYBACK_RATE = 1.35;

export function useRepeaterController() {
  const [phase, setPhase] = useState<RepeaterPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [levelDb, setLevelDb] = useState<number>(-160);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const startedAtMsRef = useRef<number>(0);
  const firstSpeechAtMsRef = useRef<number | null>(null);
  const silenceStartedAtMsRef = useRef<number | null>(null);
  const stoppingRef = useRef<boolean>(false);
  const restartingRef = useRef<boolean>(false);
  const unmountedRef = useRef<boolean>(false);

  const resetTracking = useCallback(() => {
    startedAtMsRef.current = Date.now();
    firstSpeechAtMsRef.current = null;
    silenceStartedAtMsRef.current = null;
    setLevelDb(-160);
  }, []);

  const cleanupPlayback = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch {
        // Ignore unload errors on teardown.
      }
    }
  }, []);

  const cleanupRecording = useCallback(async () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        // Recording might be already stopped.
      }
    }
  }, []);

  const beginListeningLoop = useCallback(async () => {
    if (unmountedRef.current || restartingRef.current) {
      return;
    }

    try {
      setPhase('listening');
      setError(null);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      await cleanupRecording();
      const recording = new Audio.Recording();
      recordingRef.current = recording;
      resetTracking();

      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      recording.setProgressUpdateInterval(STATUS_UPDATE_MS);
      recording.setOnRecordingStatusUpdate((status: RecordingStatus) => {
        if (!status.isLoaded || unmountedRef.current || stoppingRef.current) {
          return;
        }

        const now = Date.now();
        const db = typeof status.metering === 'number' ? status.metering : -160;
        setLevelDb(db);

        const hasSpeech = firstSpeechAtMsRef.current !== null;
        if (!hasSpeech && db > START_THRESHOLD_DB) {
          firstSpeechAtMsRef.current = now;
          setPhase('recording');
        }

        const speechDetected = firstSpeechAtMsRef.current !== null;
        if (!speechDetected) {
          if (now - startedAtMsRef.current > MAX_IDLE_RECORDING_MS && !restartingRef.current) {
            restartingRef.current = true;
            void (async () => {
              await cleanupRecording();
              restartingRef.current = false;
              if (!unmountedRef.current) {
                await beginListeningLoop();
              }
            })();
          }
          return;
        }

        if (db < SILENCE_THRESHOLD_DB) {
          if (silenceStartedAtMsRef.current === null) {
            silenceStartedAtMsRef.current = now;
          }
          const silenceMs = now - silenceStartedAtMsRef.current;
          if (silenceMs >= SILENCE_HOLD_MS && !stoppingRef.current) {
            stoppingRef.current = true;
            void (async () => {
              await finalizeAndPlay();
              stoppingRef.current = false;
            })();
          }
          return;
        }

        silenceStartedAtMsRef.current = null;
      });

      await recording.startAsync();
    } catch (recordingError) {
      setPhase('error');
      setError(recordingError instanceof Error ? recordingError.message : 'Cannot start microphone');
    }
  }, [cleanupRecording, resetTracking]);

  const playWithPitch = useCallback(async (uri: string) => {
    await cleanupPlayback();
    setPhase('playback');

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        {
          shouldPlay: true,
          rate: PLAYBACK_RATE,
          shouldCorrectPitch: false,
        },
        async (status: AVPlaybackStatus) => {
          if (!status.isLoaded) {
            return;
          }
          if (status.didJustFinish && !unmountedRef.current) {
            await cleanupPlayback();
            await beginListeningLoop();
          }
        }
      );

      soundRef.current = sound;
    } catch (playbackError) {
      setPhase('error');
      setError(playbackError instanceof Error ? playbackError.message : 'Playback failed');
      await beginListeningLoop();
    }
  }, [beginListeningLoop, cleanupPlayback]);

  const finalizeAndPlay = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      await beginListeningLoop();
      return;
    }

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        await beginListeningLoop();
        return;
      }

      await playWithPitch(uri);
    } catch (finalizeError) {
      setPhase('error');
      setError(finalizeError instanceof Error ? finalizeError.message : 'Cannot finalize recording');
      await beginListeningLoop();
    }
  }, [beginListeningLoop, playWithPitch]);

  useEffect(() => {
    void (async () => {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setPhase('denied');
        setError('Microphone permission denied');
        return;
      }
      await beginListeningLoop();
    })();

    return () => {
      unmountedRef.current = true;
      void cleanupPlayback();
      void cleanupRecording();
    };
  }, [beginListeningLoop, cleanupPlayback, cleanupRecording]);

  return { phase, error, levelDb };
}
