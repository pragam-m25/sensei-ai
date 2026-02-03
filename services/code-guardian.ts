
export class SenseiCodeGuardian {
  private static instance: SenseiCodeGuardian;
  private recoveryAttempts: number = 0;
  private readonly MAX_RECOVERIES = 5;
  private lastErrorTime: number = 0;

  private constructor() {
    console.log("%c[SENSEI-CODE-GUARDIAN] Online. Monitoring system stability.", "color: #3b82f6; font-weight: bold;");
    this.setupGlobalListeners();
  }

  static getInstance(): SenseiCodeGuardian {
    if (!SenseiCodeGuardian.instance) {
      SenseiCodeGuardian.instance = new SenseiCodeGuardian();
    }
    return SenseiCodeGuardian.instance;
  }

  private setupGlobalListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        this.logIssue('Unhandled Promise', event.reason);
        // We do not prevent default here to avoid swallowing critical browser logs, 
        // but we log our awareness of it.
      });

      window.addEventListener('error', (event) => {
        this.logIssue('Runtime Error', event.error);
      });
    }
  }

  public logIssue(type: string, error: any) {
    const timestamp = new Date().toISOString();
    console.groupCollapsed(`%c[GUARDIAN] Issue Detected: ${type}`, "color: orange");
    console.log("Time:", timestamp);
    console.log("Error:", error);
    console.log("Risk Level: Low (Attempting non-intrusive monitoring)");
    console.groupEnd();
  }

  public shouldAttemptRecovery(): boolean {
    const now = Date.now();
    // Reset counter if it's been more than 1 minute since last error (decaying error rate)
    if (now - this.lastErrorTime > 60000) {
      this.recoveryAttempts = 0;
    }
    
    this.lastErrorTime = now;
    return this.recoveryAttempts < this.MAX_RECOVERIES;
  }

  public recordRecovery() {
    this.recoveryAttempts++;
    console.log(`%c[GUARDIAN] Applied Micro-Fix (Recovery ${this.recoveryAttempts}/${this.MAX_RECOVERIES})`, "color: green");
  }
}
