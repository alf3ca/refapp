(function () {
  const toggleBtn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('quickLinksSidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (!toggleBtn || !sidebar || !overlay) {
    return;
  }

  function closeSidebar() {
    sidebar.classList.add('hidden');
    toggleBtn.classList.add('active');
    overlay.classList.remove('visible');
  }

  function openSidebar() {
    sidebar.classList.remove('hidden');
    toggleBtn.classList.remove('active');
    overlay.classList.add('visible');
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('hidden')) {
      openSidebar();
      return;
    }

    closeSidebar();
  }

  toggleBtn.addEventListener('click', toggleSidebar);

  overlay.addEventListener('click', () => {
    if (!sidebar.classList.contains('hidden')) {
      closeSidebar();
    }
  });

  sidebar.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (!sidebar.classList.contains('hidden')) {
        closeSidebar();
      }
    });
  });

  closeSidebar();
})();