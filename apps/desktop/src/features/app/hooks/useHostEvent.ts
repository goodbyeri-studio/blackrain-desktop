import { useEffect, useRef } from "react";
import type { Unsubscribe } from "../../../services/events";

type Subscribe<T> = (handler: (payload: T) => void) => Unsubscribe;
type SubscribeVoid = (handler: () => void) => Unsubscribe;

type UseHostEventOptions = {
  enabled?: boolean;
};

export function useHostEvent(
  subscribe: SubscribeVoid,
  handler: () => void,
  options?: UseHostEventOptions,
): void;
export function useHostEvent<T>(
  subscribe: Subscribe<T>,
  handler: (payload: T) => void,
  options?: UseHostEventOptions,
): void;
export function useHostEvent<T>(
  subscribe: Subscribe<T> | SubscribeVoid,
  handler: ((payload: T) => void) | (() => void),
  options: UseHostEventOptions = {},
): void {
  const handlerRef = useRef<(payload: T) => void>(handler as (payload: T) => void);
  const enabled = options.enabled ?? true;

  useEffect(() => {
    handlerRef.current = handler as (payload: T) => void;
  }, [handler]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const unlisten = (subscribe as Subscribe<T>)((payload: T) => {
      handlerRef.current(payload);
    });
    return () => {
      unlisten();
    };
  }, [enabled, subscribe]);
}
