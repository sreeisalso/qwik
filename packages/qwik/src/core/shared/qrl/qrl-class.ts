import { isDev } from '@qwik.dev/core/build';
import { assertDefined } from '../error/assert';
import { QError, qError } from '../error/error';
import { getPlatform, isServerPlatform } from '../platform/platform';
import { verifySerializable } from '../utils/serialize-utils';
import {
  invoke,
  newInvokeContext,
  newInvokeContextFromTuple,
  tryGetInvokeContext,
  type InvokeContext,
  type InvokeTuple,
} from '../../use/use-core';
import { getQFuncs, QInstanceAttr } from '../utils/markers';
import { isPromise, maybeThen } from '../utils/promises';
import { qDev, qSerialize, qTest, seal } from '../utils/qdev';
import { isArray, isFunction, type ValueOrPromise } from '../utils/types';
import type { QRLDev } from './qrl';
import type { QRL, QrlArgs, QrlReturn } from './qrl.public';
import { getSymbolHash, SYNC_QRL } from './qrl-utils';

interface SyncQRLSymbol {
  $symbol$: typeof SYNC_QRL;
}

export type SyncQRLInternal = QRLInternal & SyncQRLSymbol;

export type QRLInternalMethods<TYPE> = {
  readonly $chunk$: string | null;
  readonly $symbol$: string;
  readonly $hash$: string;

  $capture$: string[] | null;
  $captureRef$: unknown[] | null;
  dev: QRLDev | null;

  resolved: undefined | TYPE;

  resolve(): Promise<TYPE>;
  getSymbol(): string;
  getHash(): string;
  getCaptured(): unknown[] | null;
  getFn(
    currentCtx?: InvokeContext | InvokeTuple,
    beforeFn?: () => void
  ): TYPE extends (...args: any) => any
    ? (...args: Parameters<TYPE>) => ValueOrPromise<ReturnType<TYPE>>
    : // unknown so we allow assigning function QRLs to any
      unknown;

  $setContainer$(containerEl: Element | undefined): Element | undefined;
  $resolveLazy$(containerEl?: Element): ValueOrPromise<TYPE>;
};

export type QRLInternal<TYPE = unknown> = QRL<TYPE> & QRLInternalMethods<TYPE>;

export const createQRL = <TYPE>(
  chunk: string | null,
  symbol: string,
  symbolRef: null | ValueOrPromise<TYPE>,
  symbolFn: null | (() => Promise<Record<string, TYPE>>),
  capture: null | Readonly<number[]>,
  captureRef: Readonly<unknown[]> | null
): QRLInternal<TYPE> => {
  if (qDev && qSerialize) {
    if (captureRef) {
      for (const item of captureRef) {
        verifySerializable(item, 'Captured variable in the closure can not be serialized');
      }
    }
  }

  let _containerEl: Element | undefined;

  const qrl = async function (this: unknown, ...args: QrlArgs<TYPE>) {
    const boundedFn = bindFnToContext.call(this, tryGetInvokeContext());
    const result = await boundedFn(...args);
    return result;
  } as QRLInternal<TYPE>;

  const setContainer = (el: Element | undefined) => {
    if (!_containerEl) {
      _containerEl = el;
    }
    return _containerEl;
  };

  function bindFnToContext(
    this: unknown,
    currentCtx?: InvokeContext | InvokeTuple,
    beforeFn?: () => void | boolean
  ) {
    // Note that we bind the current `this`
    const bound = (...args: QrlArgs<TYPE>): ValueOrPromise<QrlReturn<TYPE> | undefined> => {
      if (!qrl.resolved) {
        return qrl.resolve().then((fn) => {
          if (!isFunction(fn)) {
            throw qError(QError.qrlIsNotFunction);
          }
          return bound(...args);
        });
      }
      if (beforeFn && beforeFn() === false) {
        return;
      }
      const context = createOrReuseInvocationContext(currentCtx);
      const prevQrl = context.$qrl$;
      const prevEvent = context.$event$;
      // Note that we set the qrl here instead of in wrapFn because
      // it is possible we're called on a copied qrl
      context.$qrl$ = qrl;
      context.$event$ ||= this as Event;
      try {
        return invoke.call(this, context, symbolRef as any, ...(args as any));
      } finally {
        context.$qrl$ = prevQrl;
        context.$event$ = prevEvent;
      }
    };
    return bound;
  }

  const resolveLazy = (containerEl?: Element): ValueOrPromise<TYPE> => {
    return symbolRef !== null ? symbolRef : resolve(containerEl);
  };

  // Wrap functions to provide their lexical scope
  const wrapFn = (fn: TYPE): TYPE => {
    if (typeof fn !== 'function' || (!capture?.length && !captureRef?.length)) {
      return fn;
    }
    return function (this: unknown, ...args: QrlArgs<TYPE>) {
      let context = tryGetInvokeContext();
      // use the given qrl if it is the right one
      if (context) {
        // TODO check if this is necessary in production
        if ((context.$qrl$ as QRLInternal)?.$symbol$ === qrl.$symbol$) {
          return fn.apply(this, args);
        }
        const prevQrl = context.$qrl$;
        context.$qrl$ = qrl;
        try {
          return fn.apply(this, args);
        } finally {
          context.$qrl$ = prevQrl;
        }
      }
      context = newInvokeContext();
      context.$qrl$ = qrl;
      context.$event$ = this as Event;
      return invoke.call(this, context, fn as any, ...args);
    } as TYPE;
  };

  const resolve = async (containerEl?: Element): Promise<TYPE> => {
    if (symbolRef !== null) {
      // Resolving (Promise) or already resolved (value)
      return symbolRef;
    }
    if (containerEl) {
      setContainer(containerEl);
    }
    if (chunk === '') {
      // Sync QRL
      assertDefined(_containerEl, 'Sync QRL must have container element');
      const hash = _containerEl.getAttribute(QInstanceAttr)!;
      const doc = _containerEl.ownerDocument!;
      const qFuncs = getQFuncs(doc, hash);
      // No need to wrap, syncQRLs can't have captured scope
      return (qrl.resolved = symbolRef = qFuncs[Number(symbol)] as TYPE);
    }

    const start = now();
    const ctx = tryGetInvokeContext();
    if (symbolFn !== null) {
      symbolRef = symbolFn().then(
        (module) => (qrl.resolved = wrapFn((symbolRef = module[symbol])))
      );
    } else {
      const imported = getPlatform().importSymbol(_containerEl, chunk, symbol);
      symbolRef = maybeThen(imported, (ref) => (qrl.resolved = wrapFn((symbolRef = ref))));
    }
    if (typeof symbolRef === 'object' && isPromise(symbolRef)) {
      symbolRef.then(
        () => emitUsedSymbol(symbol, ctx?.$element$, start),
        (err) => {
          console.error(`qrl ${symbol} failed to load`, err);
          // We shouldn't cache rejections, we can try again later
          symbolRef = null;
          throw err;
        }
      );
    }
    return symbolRef;
  };

  const createOrReuseInvocationContext = (invoke: InvokeContext | InvokeTuple | undefined) => {
    if (invoke == null) {
      return newInvokeContext();
    } else if (isArray(invoke)) {
      return newInvokeContextFromTuple(invoke);
    } else {
      return invoke;
    }
  };

  const hash = getSymbolHash(symbol);

  Object.assign(qrl, {
    getSymbol: () => symbol,
    getHash: () => hash,
    getCaptured: () => captureRef,
    resolve,
    $resolveLazy$: resolveLazy,
    $setContainer$: setContainer,
    $chunk$: chunk,
    $symbol$: symbol,
    $hash$: hash,
    getFn: bindFnToContext,

    $capture$: capture,
    $captureRef$: captureRef,
    dev: null,
    resolved: undefined,
  });
  if (symbolRef) {
    // Unwrap any promises
    symbolRef = maybeThen(symbolRef, (resolved) => (qrl.resolved = wrapFn((symbolRef = resolved))));
  }

  if (isDev) {
    Object.defineProperty(qrl, '_devOnlySymbolRef', {
      get() {
        return symbolRef;
      },
    });
  }
  if (qDev) {
    seal(qrl);
  }
  return qrl;
};

const EMITTED = /*#__PURE__*/ new Set();

export const emitUsedSymbol = (symbol: string, element: Element | undefined, reqTime: number) => {
  if (!EMITTED.has(symbol)) {
    EMITTED.add(symbol);
    emitEvent('qsymbol', {
      symbol,
      element,
      reqTime,
    });
  }
};

export const emitEvent = <T extends CustomEvent = any>(eventName: string, detail: T['detail']) => {
  if (!qTest && !isServerPlatform() && typeof document === 'object') {
    document.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: false,
        detail,
      }) as T
    );
  }
};

const now = () => {
  if (qTest || isServerPlatform()) {
    return 0;
  }
  if (typeof performance === 'object') {
    return performance.now();
  }
  return 0;
};
