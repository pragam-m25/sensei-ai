import React, { ErrorInfo, ReactNode } from 'react';
import { ShieldCheck, Activity } from 'lucide-react';
import { SenseiCodeGuardian } from '../services/code-guardian';

interface Props {
  children?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  isRecovering: boolean;
  resetKey: number;
}

export class GuardianAgent extends React.Component<Props, State> {
  private guardian: SenseiCodeGuardian;
  public state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      isRecovering: false,
      resetKey: 0
    };
    this.guardian = SenseiCodeGuardian.getInstance();
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.guardian.logIssue('React Component Crash', error);
    
    if (this.guardian.shouldAttemptRecovery()) {
      this.performSilentRecovery();
    } else {
      console.error("[GUARDIAN] Maximum recovery attempts exceeded. Performing Hard Reset.");
      if (this.props.onReset) {
         this.props.onReset();
         // After checking reset, try one more clean mount
         this.setState({ hasError: false, isRecovering: false, resetKey: this.state.resetKey + 1 });
      }
    }
  }

  performSilentRecovery = () => {
    this.guardian.recordRecovery();
    this.setState({ isRecovering: true });

    // Rapid recovery sequence
    setTimeout(() => {
      this.setState(prev => ({
        hasError: false,
        isRecovering: false,
        resetKey: prev.resetKey + 1 // Forces a clean remount of the app tree
      }));
    }, 800); // Sub-second recovery to minimize disruption
  }

  render() {
    if (this.state.hasError || this.state.isRecovering) {
       // Non-intrusive recovery UI: Instead of a white screen, we show a dark background
       // with a minimal pulse, then immediately restore the app.
       return (
         <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center transition-opacity duration-500">
            <div className="flex flex-col items-center animate-pulse space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20"></div>
                  <ShieldCheck className="w-16 h-16 text-blue-500 relative z-10" />
                </div>
                <div className="text-center">
                    <h3 className="text-blue-400 font-bold tracking-widest uppercase text-sm">System Stabilizing</h3>
                    <p className="text-blue-500/50 text-xs mt-1 font-mono">Guardian Agent applying micro-fix...</p>
                </div>
            </div>
         </div>
       );
    }

    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
        
        {/* Passive Confidence Indicator - Only visible to confirm system is protected */}
        <div className="fixed bottom-4 right-4 z-[50] pointer-events-none opacity-0 hover:opacity-100 transition-opacity duration-700 group">
            <div className="flex items-center space-x-2 bg-black/80 backdrop-blur border border-gray-800 rounded-full px-3 py-1.5 shadow-2xl">
                <Activity className="w-3 h-3 text-green-500 animate-pulse" />
                <span className="text-[10px] text-gray-500 font-mono font-bold">GUARDIAN ONLINE</span>
            </div>
        </div>
      </React.Fragment>
    );
  }
}