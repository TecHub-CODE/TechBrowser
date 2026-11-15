// Observe presentation state only; feature close/open handlers remain synchronous.
(() => {
  const timers = new WeakMap();
  const observer = new MutationObserver((records) => {
    for (const { target, oldValue } of records) {
      if (target.classList.contains('on')) {
        clearTimeout(timers.get(target));
        if (target.classList.contains('studio-closing')) target.classList.remove('studio-closing');
      } else if (
        (oldValue || '').split(/\s+/).includes('on') &&
        !target.classList.contains('studio-closing') &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        target.classList.add('studio-closing');
        timers.set(
          target,
          setTimeout(() => {
            target.classList.remove('studio-closing');
            timers.delete(target);
          }, 320),
        );
      }
    }
  });
  document.querySelectorAll('.modal,.spanel,.ai-panel,.vpn-popup,.overlay').forEach((el) =>
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    }),
  );
})();
