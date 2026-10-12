(function () {
  const csrf = document.body.dataset.csrf;
  const state = { content: { text: {}, images: {}, title: '' }, textFields: [], images: [], media: [], videos: [] };
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  async function api(url, options) {
    const settings = Object.assign({ credentials: 'same-origin' }, options || {});
    settings.headers = Object.assign({}, settings.headers || {}, { 'X-CSRF-Token': csrf });
    const response = await fetch(url, settings);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
  }

  function normalSource(source) {
    if (!source) return '';
    try {
      const parsed = new URL(source, window.location.origin);
      return parsed.origin === window.location.origin ? parsed.pathname : parsed.href;
    } catch (_) { return source; }
  }

  function parseTextFields(html, content) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const walker = document.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
    const fields = [];
    let node, index = 0;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim() || node.parentElement.closest('script,style,noscript,[aria-hidden="true"]')) continue;
      const section = node.parentElement.closest('section');
      const landmark = section || node.parentElement.closest('nav,footer');
      const heading = landmark && landmark.querySelector('h1,h2,h3,h4,h5');
      const numeric = node.parentElement.hasAttribute('data-count');
      const defaultValue = numeric ? node.parentElement.dataset.count : node.nodeValue.trim();
      const savedValue = content.text && content.text['text-' + index];
      fields.push({
        key: 'text-' + index,
        label: numeric ? 'Statistic value' : node.nodeValue.trim(),
        value: typeof savedValue === 'string' && (!numeric || /^\d+$/.test(savedValue)) ? savedValue : defaultValue,
        numeric,
        group: heading ? heading.textContent.trim() : (section && section.id ? section.id.replace(/-/g, ' ') : (landmark ? landmark.tagName.toLowerCase() : 'Page copy'))
      });
      index += 1;
    }
    return fields;
  }

  function parseImageSlots(html, content) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    return $$("img", parsed).filter(image => !image.closest('[aria-hidden="true"]')).map((image, index) => {
      const key = 'image-' + index;
      const saved = content.images && content.images[key];
      const originalSrc = normalSource(image.getAttribute('src'));
      return {
        key,
        src: saved && saved.src ? saved.src : originalSrc,
        defaultSrc: originalSrc,
        alt: saved && typeof saved.alt === 'string' ? saved.alt : image.getAttribute('alt') || '',
        section: image.closest('section') && image.closest('section').id || 'site artwork',
        position: index
      };
    });
  }

  function usePanel(panelName) {
    $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === 'panel-' + panelName));
    $$('.side-link').forEach(link => link.classList.toggle('active', link.dataset.panel === panelName));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCopy() {
    const root = $('#copy-fields');
    root.replaceChildren();
    const titleGroup = document.createElement('section');
    titleGroup.className = 'copy-group';
    const titleHeading = document.createElement('h2');
    titleHeading.textContent = 'Browser tab';
    const titleLabel = document.createElement('label');
    titleLabel.className = 'copy-field';
    titleLabel.dataset.search = 'browser tab page title';
    const titleCaption = document.createElement('span');
    titleCaption.textContent = 'Page title';
    const titleInput = document.createElement('textarea');
    titleInput.id = 'site-title';
    titleInput.maxLength = 300;
    titleInput.rows = 2;
    titleInput.value = state.content.title || '';
    titleLabel.append(titleCaption, titleInput);
    titleGroup.append(titleHeading, titleLabel);
    root.append(titleGroup);
    const groups = new Map();
    state.textFields.forEach(field => {
      if (!groups.has(field.group)) groups.set(field.group, []);
      groups.get(field.group).push(field);
    });
    groups.forEach((fields, groupName) => {
      const group = document.createElement('section');
      group.className = 'copy-group';
      const heading = document.createElement('h2');
      heading.textContent = groupName;
      group.append(heading);
      fields.forEach(field => {
        const label = document.createElement('label');
        label.className = 'copy-field';
        label.dataset.search = (field.label + ' ' + field.group + ' ' + field.value).toLowerCase();
        const name = document.createElement('span');
        name.textContent = field.label.length > 105 ? field.label.slice(0, 102) + '...' : field.label;
        const input = document.createElement(field.numeric ? 'input' : 'textarea');
        if (field.numeric) {
          input.type = 'number';
          input.min = '0';
          input.step = '1';
          input.inputMode = 'numeric';
        }
        input.value = field.value;
        input.dataset.key = field.key;
        if (!field.numeric) input.rows = Math.max(2, Math.min(4, Math.ceil(field.value.length / 85)));
        label.append(name, input);
        group.append(label);
      });
      root.append(group);
    });
    $('#text-count').textContent = state.textFields.length;
    $('#overview-text-count').textContent = state.textFields.length;
  }

  function renderImages() {
    const root = $('#image-slots');
    root.replaceChildren();
    const imageAssets = state.media.filter(item => item.kind === 'image');
    state.images.forEach(image => {
      const row = document.createElement('div');
      row.className = 'image-slot';
      row.dataset.search = (image.alt + ' ' + image.section + ' image ' + image.position).toLowerCase();
      const preview = document.createElement('img');
      preview.className = 'image-preview';
      preview.src = image.src || image.defaultSrc;
      preview.alt = '';
      const description = document.createElement('div');
      description.className = 'image-description';
      const label = document.createElement('strong');
      label.textContent = image.alt || 'Image without alt text';
      const section = document.createElement('small');
      section.textContent = image.section + ' · image ' + (image.position + 1);
      description.append(label, section);
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Image for ' + (image.alt || 'image ' + (image.position + 1)));
      const current = document.createElement('option');
      current.value = '__default__';
      current.textContent = 'Use current image';
      select.append(current);
      imageAssets.forEach(asset => {
        const option = document.createElement('option');
        option.value = asset.path;
        option.textContent = asset.name + (asset.system ? ' · site file' : ' · upload');
        select.append(option);
      });
      select.value = image.src !== image.defaultSrc && imageAssets.some(asset => asset.path === image.src) ? image.src : '__default__';
      select.addEventListener('change', () => {
        image.src = select.value === '__default__' ? image.defaultSrc : select.value;
        preview.src = image.src;
      });
      const alt = document.createElement('input');
      alt.type = 'text';
      alt.maxLength = 1000;
      alt.value = image.alt;
      alt.placeholder = 'Describe this image';
      alt.setAttribute('aria-label', 'Image description');
      alt.addEventListener('input', () => { image.alt = alt.value; label.textContent = alt.value || 'Image without alt text'; });
      row.append(preview, description, select, alt);
      root.append(row);
    });
  }

  function renderMedia() {
    const root = $('#media-library');
    root.replaceChildren();
    const uploaded = state.media.filter(item => !item.system);
    $('#library-count').textContent = uploaded.length + ' uploaded';
    uploaded.forEach(item => {
      const card = document.createElement('article');
      card.className = 'media-item uploaded';
      const thumb = document.createElement('div');
      thumb.className = 'media-thumb';
      if (item.kind === 'image') {
        const image = document.createElement('img');
        image.src = item.path;
        image.alt = '';
        thumb.append(image);
      } else {
        const video = document.createElement('video');
        video.src = item.path;
        video.preload = 'metadata';
        video.muted = true;
        thumb.append(video);
      }
      const meta = document.createElement('div');
      meta.className = 'media-meta';
      const copy = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = item.name;
      name.title = item.name;
      const type = document.createElement('small');
      type.textContent = item.kind === 'image' ? 'IMAGE' : 'VIDEO';
      copy.append(name, type);
      const remove = document.createElement('button');
      remove.className = 'delete-media';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Remove ' + item.name + ' from the media library?')) return;
        try {
          await api('/admin/api/media/' + encodeURIComponent(item.id), { method: 'DELETE' });
          await reloadMedia();
          $('#upload-status').textContent = 'Media file removed.';
        } catch (error) { showStatus($('#upload-status'), error.message, true); }
      });
      meta.append(copy, remove);
      card.append(thumb, meta);
      root.append(card);
    });
    if (!uploaded.length) {
      const empty = document.createElement('p');
      empty.className = 'loading-note';
      empty.textContent = 'Your uploaded images and video files will appear here.';
      root.append(empty);
    }
    $('#media-count').textContent = uploaded.length;
    $('#overview-media-count').textContent = uploaded.length;
    renderImages();
    renderVideoSelects();
  }

  function fillSelect(select, options, emptyLabel, includeDefault) {
    const prior = select.value;
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = emptyLabel;
    select.append(empty);
    options.forEach(item => {
      const option = document.createElement('option');
      option.value = item.path;
      option.textContent = item.name;
      select.append(option);
    });
    if (includeDefault && options.some(item => item.path === prior)) select.value = prior;
  }

  function renderVideoSelects() {
    fillSelect($('#video-source'), state.media.filter(item => item.kind === 'video'), 'Choose an uploaded video', true);
    fillSelect($('#video-poster'), state.media.filter(item => item.kind === 'image'), 'No poster image', true);
    $$('.poster-select').forEach(select => {
      const selected = select.value;
      fillSelect(select, state.media.filter(item => item.kind === 'image'), 'No poster image', true);
      if (selected) select.value = selected;
    });
  }

  function renderVideos() {
    const root = $('#video-list');
    root.replaceChildren();
    $('#playlist-count').textContent = state.videos.length + ' videos';
    $('#video-count').textContent = state.videos.length;
    $('#overview-video-count').textContent = state.videos.length;
    state.videos.forEach(video => {
      const row = document.createElement('article');
      row.className = 'video-admin-item';
      if (video.poster) {
        const poster = document.createElement('img');
        poster.className = 'video-admin-thumb';
        poster.src = video.poster;
        poster.alt = '';
        row.append(poster);
      } else {
        const preview = document.createElement('video');
        preview.className = 'video-admin-thumb';
        preview.src = video.src;
        preview.preload = 'metadata';
        preview.muted = true;
        row.append(preview);
      }
      const fields = document.createElement('div');
      fields.className = 'video-edit-fields';
      const title = document.createElement('input');
      title.value = video.title;
      title.maxLength = 200;
      title.setAttribute('aria-label', 'Video title');
      const remove = document.createElement('button');
      remove.className = 'delete-video';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Remove this video from the homepage playlist?')) return;
        try {
          await api('/admin/api/videos/' + encodeURIComponent(video.id), { method: 'DELETE' });
          await reloadVideos();
        } catch (error) { window.alert(error.message); }
      });
      const description = document.createElement('textarea');
      description.rows = 2;
      description.maxLength = 1000;
      description.value = video.description || '';
      description.setAttribute('aria-label', 'Video description');
      const posterSelect = document.createElement('select');
      posterSelect.className = 'poster-select';
      posterSelect.setAttribute('aria-label', 'Video poster image');
      const actions = document.createElement('div');
      actions.className = 'video-actions';
      const sourceName = document.createElement('span');
      const source = state.media.find(item => item.path === video.src);
      sourceName.className = 'muted-count';
      sourceName.textContent = source ? source.name : 'Uploaded video';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'save-video';
      save.textContent = 'Save details';
      save.addEventListener('click', async () => {
        try {
          await api('/admin/api/videos/' + encodeURIComponent(video.id), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title.value, description: description.value, poster: posterSelect.value })
          });
          Object.assign(video, { title: title.value, description: description.value, poster: posterSelect.value });
          save.textContent = 'Saved';
          window.setTimeout(() => { save.textContent = 'Save details'; }, 1300);
        } catch (error) { window.alert(error.message); }
      });
      actions.append(sourceName, save);
      fields.append(title, remove, description, posterSelect, actions);
      row.append(fields);
      root.append(row);
    });
    if (!state.videos.length) {
      const empty = document.createElement('p');
      empty.className = 'loading-note';
      empty.textContent = 'Your playlist is empty. Upload a video, then add it using the form.';
      root.append(empty);
    }
    renderVideoSelects();
  }

  function showStatus(element, message, isError) {
    element.textContent = message;
    element.classList.toggle('error', Boolean(isError));
  }

  async function reloadMedia() {
    state.media = await api('/admin/api/media');
    renderMedia();
  }

  async function reloadVideos() {
    state.videos = await api('/admin/api/videos');
    renderVideos();
  }

  function filterFields() {
    const query = $('#copy-search').value.trim().toLowerCase();
    $$('.copy-field').forEach(field => { field.hidden = Boolean(query) && !field.dataset.search.includes(query); });
    $$('.copy-group').forEach(group => { group.hidden = !group.querySelector('.copy-field:not([hidden])'); });
  }

  $$('.side-link,[data-panel].quick-link').forEach(button => button.addEventListener('click', () => usePanel(button.dataset.panel)));
  $('#copy-search').addEventListener('input', filterFields);
  $('#image-search').addEventListener('input', () => {
    const query = $('#image-search').value.trim().toLowerCase();
    $$('.image-slot').forEach(row => { row.hidden = Boolean(query) && !row.dataset.search.includes(query); });
  });
  async function saveContent(button, status) {
    button.disabled = true;
    showStatus(status, 'Saving…');
    const text = {};
    $$('#copy-fields [data-key]').forEach(input => { text[input.dataset.key] = input.value; });
    const images = {};
    state.images.forEach((image, index) => {
      const row = $$('.image-slot')[index];
      const selection = row && $('select', row);
      images[image.key] = {
        src: selection && selection.value !== '__default__' ? selection.value : image.defaultSrc,
        alt: image.alt
      };
    });
    try {
      await api('/admin/api/content', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, images, title: $('#site-title').value })
      });
      state.content.text = text;
      state.content.images = images;
      state.content.title = $('#site-title').value;
      showStatus(status, 'All page changes saved.');
    } catch (error) { showStatus(status, error.message, true); }
    button.disabled = false;
  }
  $('#save-copy').addEventListener('click', event => saveContent(event.currentTarget, $('#copy-status')));
  $('#save-media-settings').addEventListener('click', event => saveContent(event.currentTarget, $('#media-save-status')));

  async function uploadFiles(files) {
    const status = $('#upload-status');
    for (const file of files) {
      showStatus(status, 'Uploading ' + file.name + '…');
      const data = new FormData();
      data.append('file', file);
      try {
        await api('/admin/api/media', { method: 'POST', body: data });
        showStatus(status, file.name + ' uploaded.');
      } catch (error) { showStatus(status, error.message, true); }
    }
    $('#media-upload').value = '';
    await reloadMedia();
  }

  $('#media-upload').addEventListener('change', event => uploadFiles(Array.from(event.target.files)));
  const uploadZone = $('#upload-zone');
  ['dragenter', 'dragover'].forEach(name => uploadZone.addEventListener(name, event => {
    event.preventDefault(); uploadZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach(name => uploadZone.addEventListener(name, event => {
    event.preventDefault(); uploadZone.classList.remove('dragging');
  }));
  uploadZone.addEventListener('drop', event => uploadFiles(Array.from(event.dataTransfer.files)));

  $('#add-video-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await api('/admin/api/videos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
      });
      form.reset();
      showStatus($('#video-form-status'), 'Added to the homepage playlist.');
      await reloadVideos();
    } catch (error) { showStatus($('#video-form-status'), error.message, true); }
  });

  async function start() {
    try {
      const [html, content] = await Promise.all([
        fetch('/admin/api/source').then(response => {
          if (!response.ok) throw new Error('Sign in again to continue.');
          return response.text();
        }),
        api('/admin/api/content')
      ]);
      state.content = content;
      state.textFields = parseTextFields(html, content);
      state.images = parseImageSlots(html, content);
      renderCopy();
      await Promise.all([reloadMedia(), reloadVideos()]);
    } catch (error) {
      $$('.loading-note').forEach(note => { note.textContent = error.message; });
    }
  }
  start();
})();
