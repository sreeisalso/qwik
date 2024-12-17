import { logErrorAndStop } from '../utils/log';
import { qDev } from '../utils/qdev';

export const codeToText = (code: number, ...parts: any[]): string => {
  if (qDev) {
    // Keep one error, one line to make it easier to search for the error message.
    const MAP = [
      'Error while serializing class or style attributes', // 0
      '', // 1
      '', // 2
      'Only primitive and object literals can be serialized', // 3
      '', // 4
      'You can render over a existing q:container. Skipping render().', // 5
      '', // 6
      '', // 7
      '', // 8
      '', // 9
      'QRL is not a function', // 10
      'Dynamic import not found', // 11
      'Unknown type argument', // 12
      `Actual value for useContext({{0}}) can not be found, make sure some ancestor component has set a value using useContextProvider(). In the browser make sure that the context was used during SSR so its state was serialized.`, // 13
      "Invoking 'use*()' method outside of invocation context.", // 14
      '', // 15
      '', // 16
      '', // 17
      '', // 18
      '', // 19
      `Calling a 'use*()' method outside 'component$(() => { HERE })' is not allowed. 'use*()' methods provide hooks to the 'component$' state and lifecycle, ie 'use' hooks can only be called synchronously within the 'component$' function or another 'use' method.\nSee https://qwik.dev/docs/components/tasks/#use-method-rules`, // 20
      '', // 21
      '', // 22
      '', // 23
      '', // 24
      '', // 25
      '', // 26
      '', // 27
      'The provided Context reference "{{0}}" is not a valid context created by createContextId()', // 28
      'SsrError(tag): {{0}}', // 29
      'QRLs can not be resolved because it does not have an attached container. This means that the QRL does not know where it belongs inside the DOM, so it cant dynamically import() from a relative path.', // 30
      'QRLs can not be dynamically resolved, because it does not have a chunk path', // 31
      'The JSX ref attribute must be a Signal', // 32
    ];
    let text = MAP[code] ?? '';
    if (parts.length) {
      text = text.replaceAll(/{{(\d+)}}/g, (_, index) => {
        let v = parts[index];
        if (v && typeof v === 'object' && v.constructor === Object) {
          v = JSON.stringify(v).slice(0, 50);
        }
        return v;
      });
    }
    return `Code(Q${code}): ${text}`;
  } else {
    // cute little hack to give roughly the correct line number. Update the line number if it shifts.
    return `Code(Q${code}) https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/core/error/error.ts#L${8 + code}`;
  }
};

export const enum QError {
  stringifyClassOrStyle = 0,
  UNUSED_1 = 1,
  UNUSED_2 = 2,
  verifySerializable = 3,
  UNUSED_4 = 4,
  cannotRenderOverExistingContainer = 5,
  UNUSED_6 = 6,
  UNUSED_7 = 7,
  UNUSED_8 = 8,
  UNUSED_9 = 9,
  qrlIsNotFunction = 10,
  dynamicImportFailed = 11,
  unknownTypeArgument = 12,
  notFoundContext = 13,
  useMethodOutsideContext = 14,
  UNUSED_15 = 15,
  UNUSED_16 = 16,
  UNUSED_17 = 17,
  UNUSED_18 = 18,
  UNUSED_19 = 19,
  useInvokeContext = 20,
  UNUSED_21 = 21,
  UNUSED_22 = 22,
  UNUSED_23 = 23,
  UNUSED_24 = 24,
  UNUSED_25 = 25,
  UNUSED_26 = 26,
  UNUSED_27 = 27,
  invalidContext = 28,
  tagError = 29,
  qrlMissingContainer = 30,
  qrlMissingChunk = 31,
  invalidRefValue = 32,
}

export const qError = (code: number, ...parts: any[]): Error => {
  const text = codeToText(code, ...parts);
  return logErrorAndStop(text, ...parts);
};
