(function () {
  var pages = {
    '/': 'home',
    '/about': 'about',
    '/programs': 'programs',
    '/student-life': 'student-life',
    '/why-us': 'why-us',
    '/videos': 'videos',
    '/contact': 'contact'
  };
  var titles = {
    home: 'Home',
    about: 'About',
    programs: 'Programs',
    'student-life': 'Student Life',
    'why-us': 'Why Us',
    videos: 'Videos',
    contact: 'Contact'
  };
  var page = pages[window.location.pathname] || 'home';
  document.documentElement.dataset.page = page;
  if (page !== 'home') document.title = titles[page] + ' | Wise Robotics & STEM';

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('#menu a').forEach(function (link) {
      if (link.getAttribute('href') === window.location.pathname) {
        link.setAttribute('aria-current', 'page');
      }
    });
  });
})();
