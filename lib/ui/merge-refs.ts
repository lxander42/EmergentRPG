import type { Ref, RefCallback, MutableRefObject } from "react";

// Combine multiple refs (object-refs and callback-refs) onto a single
// element. React 19 still doesn't ship a public `mergeRefs` helper, and
// re-implementing the same one-liner in every component that wants to
// share a ref between two hooks is not a good time.
export function mergeRefs<T>(
  ...refs: Array<Ref<T> | undefined>
): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref != null) (ref as MutableRefObject<T | null>).current = value;
    }
  };
}
