(function () {
  const toggleBtn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('quickLinksSidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (!toggleBtn || !sidebar || !overlay) {
    return;
  }

  let touchStartX = 0;
  let touchEndX = 0;

  function closeSidebar() {
    sidebar.classList.add('hidden');
    toggleBtn.classList.add('active');
    overlay.classList.remove('visible');
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  function openSidebar() {
    sidebar.classList.remove('hidden');
    toggleBtn.classList.remove('active');
    overlay.classList.add('visible');
    toggleBtn.setAttribute('aria-expanded', 'true');
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('hidden')) {
      openSidebar();
      return;
    }
    closeSidebar();
  }

  // Click handler for toggle button
  toggleBtn.addEventListener('click', toggleSidebar);

  // Click handler for overlay - close sidebar
  overlay.addEventListener('click', () => {
    if (!sidebar.classList.contains('hidden')) {
      closeSidebar();
    }
  });

  // Keyboard handler - close on Escape
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !sidebar.classList.contains('hidden')) {
      closeSidebar();
    }
  });

  // Close sidebar when a link is clicked
  sidebar.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (!sidebar.classList.contains('hidden')) {
        closeSidebar();
      }
    });
  });

  // Touch swipe support for mobile
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, false);

  document.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, false);

  function handleSwipe() {
    const isLeftSwipe = touchStartX - touchEndX > 50;
    const isRightSwipe = touchEndX - touchStartX > 50;

    if (isLeftSwipe && !sidebar.classList.contains('hidden')) {
      closeSidebar();
    } else if (isRightSwipe && sidebar.classList.contains('hidden')) {
      openSidebar();
    }
  }

  // Initialize sidebar as closed
  closeSidebar();
})();