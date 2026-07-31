export type SystemPowerLifecycleTarget = {
  prepareForSystemSuspend(): Promise<void>;
  resumeFromSystemSleep(): Promise<void>;
};

export type SystemPowerEventSource = {
  on(event: "suspend" | "resume", listener: () => void): unknown;
  off(event: "suspend" | "resume", listener: () => void): unknown;
};

export class SystemPowerLifecycle {
  readonly #targets: readonly SystemPowerLifecycleTarget[];
  readonly #onError: (error: unknown) => void;
  #requestedState: "active" | "suspended" = "active";
  #transition: Promise<void> = Promise.resolve();
  #disposed = false;

  constructor(
    targets: readonly SystemPowerLifecycleTarget[],
    onError: (error: unknown) => void = (error) =>
      console.error("系统电源生命周期处理失败", error),
  ) {
    this.#targets = targets;
    this.#onError = onError;
  }

  suspend(): void {
    if (this.#disposed || this.#requestedState === "suspended") return;
    this.#requestedState = "suspended";
    this.#enqueue(() =>
      this.#runTargets((target) => target.prepareForSystemSuspend()),
    );
  }

  resume(): void {
    if (this.#disposed || this.#requestedState === "active") return;
    this.#requestedState = "active";
    this.#enqueue(() => this.#runTargets((target) => target.resumeFromSystemSleep()));
  }

  whenIdle(): Promise<void> {
    return this.#transition;
  }

  dispose(): void {
    this.#disposed = true;
  }

  #enqueue(operation: () => Promise<void>): void {
    this.#transition = this.#transition
      .then(operation)
      .catch((error) => this.#onError(error));
  }

  async #runTargets(
    operation: (target: SystemPowerLifecycleTarget) => Promise<void>,
  ): Promise<void> {
    const results = await Promise.allSettled(this.#targets.map(operation));
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, "系统电源生命周期目标处理失败");
    }
  }
}

export function bindSystemPowerEvents(
  source: SystemPowerEventSource,
  lifecycle: SystemPowerLifecycle,
): () => void {
  const suspend = () => lifecycle.suspend();
  const resume = () => lifecycle.resume();
  source.on("suspend", suspend);
  source.on("resume", resume);
  return () => {
    source.off("suspend", suspend);
    source.off("resume", resume);
  };
}
