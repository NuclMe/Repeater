import { useEffect, useRef, useState, type ComponentType } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { useRepeaterController } from '@/hooks/use-repeater-controller';

type RiveRuntime = typeof import('@rive-app/react-native') | null;
type RiveController = {
  awaitViewReady?: () => Promise<boolean>;
  playIfNeeded?: () => void;
  setBooleanInputValue?: (name: string, value: boolean, path?: string) => void;
  setNumberInputValue?: (name: string, value: number, path?: string) => void;
  triggerInput?: (name: string, path?: string) => void;
};
const CHARACTER_STATE_MACHINE = 'State Machine 1';
const CHARACTER_ARTBOARD = 'Artboard';

function getRiveRuntime(): RiveRuntime {
  // Expo Go cannot run Nitro modules used by @rive-app/react-native.
  if (Constants.appOwnership === 'expo') {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@rive-app/react-native') as typeof import('@rive-app/react-native');
  } catch {
    return null;
  }
}

export default function HomeScreen() {
  const { phase, error, levelDb, debugStep } = useRepeaterController();
  const riveRuntime = getRiveRuntime();
  const useRiveFile = riveRuntime?.useRiveFile;
  const Fit = riveRuntime?.Fit;
  const RiveView = riveRuntime?.RiveView;
  const DynamicRiveView = RiveView as unknown as ComponentType<
    Record<string, unknown>
  >;

  const { riveFile, error: riveLoadError } = useRiveFile?.(
    require('../../assets/rive/character.riv'),
  ) ?? { riveFile: null, error: null };

  const meterPercent = Math.max(0, Math.min(1, (levelDb + 60) / 35));
  const fitContain = Fit?.Contain;
  const showRive = Boolean(riveRuntime && riveFile && RiveView && fitContain);
  const riveRef = useRef<RiveController | null>(null);
  const [riveBindGeneration, setRiveBindGeneration] = useState(0);
  const prevPhaseRef = useRef<typeof phase | null>(null);

  useEffect(() => {
    if (!showRive || !riveRef.current) {
      return;
    }

    const rive = riveRef.current;
    void (async () => {
      try {
        await rive.awaitViewReady?.();
      } catch {
        // Keep trying on next phase/value update.
      }

      const isListening = phase === 'listening' || phase === 'recording';
      const isRecording = phase === 'recording';
      const isPlayback = phase === 'playback';
      const isProblem = phase === 'error' || phase === 'denied';

      const safe = (fn: () => void) => {
        try {
          fn();
        } catch {
          // Ignore unsupported input type/name mismatches for this frame.
        }
      };

      safe(() => rive.setBooleanInputValue?.('Hear', isListening));
      safe(() => rive.setBooleanInputValue?.('Talk', isPlayback));
      safe(() => rive.setBooleanInputValue?.('Check', isRecording));
      safe(() =>
        rive.setNumberInputValue?.(
          'Look',
          isListening || isRecording ? meterPercent : 0,
        ),
      );

      const prevPhase = prevPhaseRef.current;
      if (phase !== prevPhase) {
        if (isPlayback) {
          safe(() => rive.triggerInput?.('success'));
        } else if (isProblem) {
          safe(() => rive.triggerInput?.('fail'));
        }
      }
      safe(() => rive.playIfNeeded?.());
      prevPhaseRef.current = phase;
    })();
  }, [showRive, phase, meterPercent, riveBindGeneration]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.characterContainer, phaseStyles[phase]]}>
        {showRive ? (
          <DynamicRiveView
            file={riveFile}
            artboardName={CHARACTER_ARTBOARD}
            stateMachineName={CHARACTER_STATE_MACHINE}
            fit={fitContain}
            autoPlay
            hybridRef={{
              f: (instance: RiveController | null) => {
                const prev = riveRef.current;
                riveRef.current = instance;
                if (instance && instance !== prev) {
                  setRiveBindGeneration((n) => n + 1);
                }
              },
            }}
            style={styles.rive}
            onError={(riveError: { message?: string }) =>
              console.warn(
                'Rive render error:',
                riveError?.message ?? 'unknown',
              )
            }
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              {!riveRuntime
                ? 'Rive is unavailable in Expo Go'
                : 'Loading character...'}
            </Text>
            {!riveRuntime ? (
              <Text style={styles.placeholderSubtext}>
                Run a Development Build (EAS) to show .riv.
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.stateTitle}>{labelByPhase[phase]}</Text>
        <Text style={styles.debugText}>phase: {phase}</Text>
        <Text style={styles.debugText}>
          mic level: {Math.round(levelDb)} dB
        </Text>
        <Text style={styles.debugText}>step: {debugStep}</Text>
        <View style={styles.meterTrack}>
          <View
            style={[
              styles.meterFill,
              { transform: [{ scaleX: Math.max(0.04, meterPercent) }] },
            ]}
          />
        </View>
        <Text style={styles.helperText}>
          Speak near microphone. Stop for ~1s to replay.
        </Text>
        {!riveRuntime ? (
          <Text style={styles.helperText}>
            Rive disabled in Expo Go. Use EAS dev build to see character
            animation.
          </Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {riveLoadError ? (
          <Text style={styles.errorText}>{riveLoadError.message}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0C0F14',
    padding: 20,
    justifyContent: 'center',
  },
  characterContainer: {
    width: '100%',
    height: 360,
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#141A22',
  },
  rive: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#C4CBD6',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderSubtext: {
    marginTop: 8,
    color: '#97A6B9',
    fontSize: 13,
  },
  infoCard: {
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#141A22',
  },
  stateTitle: {
    color: '#F4F6F9',
    fontSize: 18,
    fontWeight: '700',
  },
  meterTrack: {
    height: 10,
    borderRadius: 999,
    marginTop: 12,
    backgroundColor: '#253040',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#53B5FD',
  },
  helperText: {
    marginTop: 12,
    color: '#B7C2D0',
    fontSize: 13,
  },
  debugText: {
    marginTop: 6,
    color: '#8EA2BC',
    fontSize: 12,
  },
  errorText: {
    marginTop: 8,
    color: '#FF8686',
    fontSize: 13,
  },
});

const labelByPhase: Record<
  ReturnType<typeof useRepeaterController>['phase'],
  string
> = {
  idle: 'Idle',
  listening: 'Listening...',
  recording: 'Recording...',
  playback: 'Playback (higher pitch)',
  denied: 'Microphone access denied',
  error: 'Audio error',
};

const phaseStyles: Record<
  ReturnType<typeof useRepeaterController>['phase'],
  { borderColor: string }
> = {
  idle: { borderColor: '#4C5D75' },
  listening: { borderColor: '#3D9BFF' },
  recording: { borderColor: '#46D98F' },
  playback: { borderColor: '#BD7CFF' },
  denied: { borderColor: '#FF8C8C' },
  error: { borderColor: '#FF8C8C' },
};
