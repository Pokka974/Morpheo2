(() => {
  'use strict';

  function seedStars() {
    const host = document.getElementById('mo-stars');
    if (!host || host.childElementCount) return;
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 90; i++) {
      const s = document.createElement('span');
      const r = rnd(1, 2.4);
      s.style.cssText =
        `left:${rnd(0, 100).toFixed(2)}%;top:${rnd(0, 100).toFixed(2)}%;` +
        `width:${r.toFixed(1)}px;height:${r.toFixed(1)}px;opacity:.2;` +
        `animation:mo-twinkle ${rnd(3.5, 9).toFixed(1)}s ease-in-out ${rnd(0, 6).toFixed(1)}s infinite`;
      host.appendChild(s);
    }
  }

  function observeReveals() {
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    nodes.forEach((n) => io.observe(n));
  }

  function setupFaq() {
    document.querySelectorAll('.faq-item').forEach((item) => {
      const question = item.querySelector('.faq-question');
      const answer = item.querySelector('.faq-answer');
      const icon = item.querySelector('.faq-icon');
      if (!question || !answer || !icon) return;
      question.addEventListener('click', () => {
        const isOpen = question.getAttribute('aria-expanded') === 'true';
        question.setAttribute('aria-expanded', String(!isOpen));
        answer.hidden = isOpen;
        icon.textContent = isOpen ? '+' : '−';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    seedStars();
    observeReveals();
    setupFaq();
  });
})();
