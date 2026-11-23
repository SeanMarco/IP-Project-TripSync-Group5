(() => {
  const topNav = document.querySelector('.top-nav');
  const inner = document.querySelector('.top-nav-inner');
  const links = document.querySelector('.top-links');
  if (!topNav || !inner || !links) return;

  const menuButton = document.createElement('button');
  menuButton.className = 'icon-button menu-toggle';
  menuButton.type = 'button';
  menuButton.setAttribute('aria-label', 'Open menu');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.innerHTML = '<span></span><span></span><span></span>';
  inner.prepend(menuButton);

  const head = document.createElement('div');
  head.className = 'drawer-head';
  head.append(inner.querySelector('.brand').cloneNode(true));
  head.insertAdjacentHTML('beforeend', '<button class="icon-button drawer-close" type="button" aria-label="Close menu">✕</button>');
  links.prepend(head);

  const foot = document.createElement('div');
  foot.className = 'drawer-foot';
  foot.innerHTML = '<span class="avatar"></span><div><small>Good day,</small><strong></strong></div><button class="drawer-logout" type="button">Log out</button>';
  links.append(foot);

  const shade = document.createElement('div');
  shade.className = 'nav-shade';
  topNav.append(shade);

  const toggle = (open) => {
    document.body.classList.toggle('nav-open', open);
    menuButton.setAttribute('aria-expanded', open);
    if (open) {
      foot.querySelector('.avatar').textContent = document.getElementById('top-avatar')?.textContent || 'TS';
      foot.querySelector('strong').textContent = document.getElementById('top-name')?.textContent || 'Traveler';
    }
  };

  menuButton.addEventListener('click', () => toggle(true));
  shade.addEventListener('click', () => toggle(false));
  head.querySelector('.drawer-close').addEventListener('click', () => toggle(false));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) toggle(false); });
  foot.querySelector('.drawer-logout').addEventListener('click', () => document.getElementById('logout-button')?.click());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
  matchMedia('(min-width: 701px)').addEventListener('change', (e) => { if (e.matches) toggle(false); });
})();
