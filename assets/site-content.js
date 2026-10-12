(function () {
  function visibleTextNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [], node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim() || node.parentElement.closest('script,style,noscript,[aria-hidden="true"]')) continue;
      nodes.push(node);
    }
    return nodes;
  }

  function renderVideos(videos) {
    var player = document.getElementById('video-player');
    var playlist = document.getElementById('video-playlist');
    if (!player || !playlist) return;
    player.replaceChildren();
    playlist.replaceChildren();
    if (!videos || !videos.length) {
      var empty = document.createElement('div');
      empty.className = 'video-empty';
      var icon = document.createElement('i');
      icon.className = 'fas fa-film';
      icon.setAttribute('aria-hidden', 'true');
      var message = document.createElement('p');
      message.textContent = 'Featured videos will appear here.';
      empty.append(icon, message);
      player.append(empty);
      return;
    }

    function selectVideo(video, button) {
      player.replaceChildren();
      var element = document.createElement('video');
      element.controls = true;
      element.playsInline = true;
      element.preload = 'metadata';
      element.src = video.src;
      if (video.poster) element.poster = video.poster;
      var caption = document.createElement('div');
      caption.className = 'video-caption';
      var heading = document.createElement('h3');
      heading.textContent = video.title;
      var description = document.createElement('p');
      description.textContent = video.description || '';
      caption.append(heading, description);
      player.append(element, caption);
      playlist.querySelectorAll('.video-choice').forEach(function (choice) {
        choice.classList.toggle('active', choice === button);
        choice.setAttribute('aria-pressed', choice === button ? 'true' : 'false');
      });
    }

    videos.forEach(function (video, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'video-choice';
      button.setAttribute('aria-pressed', 'false');
      var icon = document.createElement('span');
      icon.className = 'play-icon';
      icon.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
      var copy = document.createElement('span');
      var title = document.createElement('strong');
      title.textContent = video.title;
      var description = document.createElement('small');
      description.textContent = video.description || 'Play featured video';
      copy.append(title, description);
      button.append(icon, copy);
      button.addEventListener('click', function () { selectVideo(video, button); });
      playlist.append(button);
      if (index === 0) selectVideo(video, button);
    });
  }

  fetch('/api/site-content')
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (content) {
      if (!content) return;
      visibleTextNodes(document.body).forEach(function (node, index) {
        var value = content.text && content.text['text-' + index];
        if (typeof value !== 'string') return;
        if (node.parentElement.hasAttribute('data-count')) {
          if (!/^\d+$/.test(value)) return;
          node.parentElement.dataset.count = value;
        }
        var edge = node.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/);
        node.nodeValue = edge[1] + value + edge[3];
      });
      if (content.title) {
        var page = document.documentElement.dataset.page || 'home';
        var pageTitles = {about:'About',programs:'Programs','student-life':'Student Life','why-us':'Why Us',videos:'Videos',contact:'Contact'};
        document.title = pageTitles[page] ? pageTitles[page] + ' | ' + content.title.split('|')[0].trim() : content.title;
      }
      Array.from(document.querySelectorAll('img')).filter(function (image) {
        return !image.closest('[aria-hidden="true"]');
      }).forEach(function (image, index) {
        var change = content.images && content.images['image-' + index];
        if (!change) return;
        if (change.src) image.src = change.src;
        if (typeof change.alt === 'string') image.alt = change.alt;
      });
      renderVideos(content.videos || []);
    })
    .catch(function () {});
})();
