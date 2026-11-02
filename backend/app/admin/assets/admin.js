(function () {
  'use strict';

  var API_SUBMISSIONS = '/api/v1/submissions';
  var API_AUTH = '/api/v1/auth';
  var API_ADMIN_CONTENT = '/api/v1/admin/content';
  var API_ADMIN_AUTHORS = '/api/v1/admin/authors';
  var API_ADMIN_CATEGORIES = '/api/v1/admin/categories';
  var API_ADMIN_MEDIA = '/api/v1/admin/media';

  var PAGE_SIZE = 25;
  var ED_PAGE_SIZE = 15;

  var $ = function (id) { return document.getElementById(id); };

  // ---------- Global State ----------
  var state = {
    currentTab: 'forms', // 'forms' | 'editorial'
    // Form submissions
    formType: '',
    status: '',
    q: '',
    page: 1,
    total: 0,
    items: [],
    currentSubmission: null,
    // Editorial Content
    edView: 'list', // 'list' | 'editor'
    edEditingId: null,
    edTypeFilter: '',
    edStatusFilter: '',
    edSearchQuery: '',
    edSortBy: 'created_at',
    edSortOrder: 'desc',
    edPage: 1,
    edTotal: 0,
    edItems: [],
    authors: [],
    categories: [],
    quill: null,
    faqs: []
  };

  // ---------- Utilities ----------
  function toast(message, isError) {
    var t = $('toast');
    t.textContent = message;
    t.classList.toggle('is-error', !!isError);
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.hidden = true; }, 3000);
  }

  function request(path, opts) {
    opts = Object.assign({ credentials: 'same-origin' }, opts || {});
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) {
        showLogin('Your session has ended. Please sign in again.');
        throw new Error('unauthorized');
      }
      if (!res.ok) {
        return res.json().catch(function () { return { detail: 'Request failed (' + res.status + ')' }; }).then(function (err) {
          throw new Error(err.detail || 'Request failed');
        });
      }
      return res;
    });
  }

  function requestJson(path, opts) {
    return request(path, opts).then(function (res) {
      if (res.status === 204) return null;
      return res.json();
    });
  }

  function slugify(text) {
    return (text || '')
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  var fullDateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  var dateOnlyFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  // =========================================================================
  // VIEW SWITCHING (Tabs: Form Responses vs Editorial Content)
  // =========================================================================
  function switchPortalTab(tab) {
    state.currentTab = tab;
    var formsBtn = $('nav-forms-btn');
    var edBtn = $('nav-editorial-btn');
    var formsView = $('forms-view');
    var edView = $('editorial-view');

    if (tab === 'forms') {
      formsBtn.classList.add('is-active');
      formsBtn.setAttribute('aria-selected', 'true');
      edBtn.classList.remove('is-active');
      edBtn.setAttribute('aria-selected', 'false');
      formsView.hidden = false;
      edView.hidden = true;
      refreshSubmissions();
    } else {
      edBtn.classList.add('is-active');
      edBtn.setAttribute('aria-selected', 'true');
      formsBtn.classList.remove('is-active');
      formsBtn.setAttribute('aria-selected', 'false');
      edView.hidden = false;
      formsView.hidden = true;
      loadReferenceData().then(function () {
        refreshEditorialList();
      });
    }
  }

  // =========================================================================
  // AUTHENTICATION
  // =========================================================================
  function showLogin(message) {
    closeDrawer();
    $('app-view').hidden = true;
    $('login-view').hidden = false;
    $('login-error').textContent = message || '';
    $('login-error').hidden = !message;
    $('login-password').value = '';
    ($('login-email').value ? $('login-password') : $('login-email')).focus();
  }

  function showApp(email) {
    $('user-email').textContent = email;
    $('login-view').hidden = true;
    $('app-view').hidden = false;
    switchPortalTab(state.currentTab);
  }

  function checkSession() {
    fetch(API_AUTH + '/me', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('signed out');
        return res.json();
      })
      .then(function (me) { showApp(me.email); })
      .catch(function () { showLogin(); });
  }

  function signIn(email, password) {
    var btn = $('login-btn');
    btn.disabled = true;
    $('login-error').hidden = true;
    fetch(API_AUTH + '/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Invalid email or password');
        return checkSession();
      })
      .catch(function (err) {
        $('login-error').textContent = err.message || 'Sign in failed';
        $('login-error').hidden = false;
      })
      .finally(function () { btn.disabled = false; });
  }

  function signOut() {
    fetch(API_AUTH + '/logout', { method: 'POST', credentials: 'same-origin' }).finally(function () {
      showLogin('You have been signed out.');
    });
  }

  // =========================================================================
  // SUBMISSIONS SECTION
  // =========================================================================
  var FORM_LABELS = {
    expert_consultation: 'Consultation',
    calendar_request: 'Calendar',
    case_study_request: 'Case study'
  };
  var STATUS_LABELS = {
    new: 'New',
    contacted: 'Contacted',
    archived: 'Archived'
  };
  var OBJECTIVE_LABELS = {
    'roundtables': 'Virtual CISO Roundtables',
    'stalled-deals': 'Stalled account reactivation',
    'net-new': 'Net-new account penetration',
    'webinars': 'Webinars & summits',
    'custom': 'Custom ABM program'
  };

  function refreshSubmissions() {
    $('list-error').hidden = true;
    var params = new URLSearchParams({
      page: state.page,
      page_size: PAGE_SIZE
    });
    if (state.formType) params.set('form_type', state.formType);
    if (state.status) params.set('status', state.status);
    if (state.q) params.set('q', state.q);

    requestJson(API_SUBMISSIONS + '?' + params.toString())
      .then(function (data) {
        state.total = data.total;
        state.items = data.items;
        renderSubmissionsTable();
        renderSubmissionsPager();
      })
      .catch(function (err) {
        if (err.message !== 'unauthorized') {
          $('list-error').textContent = 'Could not load form responses: ' + err.message;
          $('list-error').hidden = false;
        }
      });

    loadSubmissionsStats();
  }

  function loadSubmissionsStats() {
    requestJson(API_SUBMISSIONS + '/stats').then(function (stats) {
      if (!stats) return;
      var setStat = function (k, val) {
        var el = document.querySelector('[data-stat="' + k + '"]');
        if (el) el.textContent = Number(val != null ? val : 0).toLocaleString();
      };
      setStat('total', stats.total);
      if (stats.by_form_type) {
        Object.keys(stats.by_form_type).forEach(function (k) {
          setStat(k, stats.by_form_type[k]);
        });
      }
      if (stats.by_status) {
        setStat('new', stats.by_status.new);
      }
    }).catch(function () {});
  }

  function renderSubmissionsTable() {
    var tbody = $('rows');
    tbody.innerHTML = '';
    var items = state.items;
    $('empty').hidden = items.length > 0;

    items.forEach(function (it) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', it.id);
      tr.addEventListener('click', function () { openDrawer(it); });

      var tdDate = document.createElement('td');
      tdDate.className = 'cell-date';
      tdDate.textContent = fullDateFmt.format(new Date(it.created_at));

      var tdForm = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'badge badge-' + it.form_type;
      badge.textContent = FORM_LABELS[it.form_type] || it.form_type;
      tdForm.appendChild(badge);

      var tdName = document.createElement('td');
      tdName.className = 'cell-name';
      tdName.textContent = it.name;

      var tdComp = document.createElement('td');
      tdComp.textContent = it.company;

      var tdEmail = document.createElement('td');
      tdEmail.className = 'cell-muted';
      tdEmail.textContent = it.email;

      var tdFocus = document.createElement('td');
      tdFocus.className = 'cell-muted';
      tdFocus.textContent = OBJECTIVE_LABELS[it.objective] || it.objective || '–';

      var tdStatus = document.createElement('td');
      var sp = document.createElement('span');
      sp.className = 'status-pill status-' + it.status;
      sp.textContent = (STATUS_LABELS[it.status] || it.status);
      tdStatus.appendChild(sp);

      tr.appendChild(tdDate);
      tr.appendChild(tdForm);
      tr.appendChild(tdName);
      tr.appendChild(tdComp);
      tr.appendChild(tdEmail);
      tr.appendChild(tdFocus);
      tr.appendChild(tdStatus);
      tbody.appendChild(tr);
    });
  }

  function renderSubmissionsPager() {
    var start = state.total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
    var end = Math.min(state.page * PAGE_SIZE, state.total);
    $('pager-info').textContent = state.total === 0 ? '' : start + '–' + end + ' of ' + state.total.toLocaleString();
    $('prev-btn').disabled = state.page <= 1;
    $('next-btn').disabled = end >= state.total;
  }

  function openDrawer(itemOrId) {
    if (typeof itemOrId === 'object' && itemOrId !== null) {
      populateDrawer(itemOrId);
      return;
    }
    var found = state.items.find(function (r) { return r.id === itemOrId; });
    if (found) {
      populateDrawer(found);
      return;
    }
    requestJson(API_SUBMISSIONS + '/' + itemOrId).then(function (it) {
      populateDrawer(it);
    }).catch(function (err) {
      toast(err.message, true);
    });
  }

  function populateDrawer(it) {
    state.currentSubmission = it;
    var meta = it.metadata || {};

    $('d-name').textContent = it.name;
    var subParts = [it.job_title, it.company].filter(Boolean);
    $('d-sub').textContent = subParts.join(' · ') || it.company || '';
    $('d-form').className = 'badge badge-' + it.form_type;
    $('d-form').textContent = FORM_LABELS[it.form_type] || it.form_type;

    var dl = $('d-fields');
    dl.innerHTML = '';
    function addField(label, val, href) {
      if (val == null || val === '') return;
      var dt = document.createElement('dt'); dt.textContent = label;
      var dd = document.createElement('dd');
      if (href) {
        var a = document.createElement('a'); a.href = href; a.textContent = val;
        if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        dd.appendChild(a);
      } else {
        dd.textContent = val;
      }
      dl.appendChild(dt); dl.appendChild(dd);
    }

    addField('Email', it.email, 'mailto:' + it.email);
    addField('Company', it.company);
    addField('Job title', it.job_title);
    addField('Program focus', OBJECTIVE_LABELS[it.objective] || it.objective);
    addField('Case study', meta.case_study_title);
    addField('Received', fullDateFmt.format(new Date(it.created_at)));
    if (meta.page_url) addField('Page', meta.page_url, meta.page_url);
    if (meta.referrer) addField('Referrer', meta.referrer, meta.referrer);

    var utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
      .filter(function (k) { return meta[k]; })
      .map(function (k) { return k.replace('utm_', '') + ': ' + meta[k]; })
      .join(' · ');
    if (utm) addField('UTM', utm);
    addField('ID', it.id);

    var msg = $('d-message');
    msg.textContent = it.message || 'No additional message left.';
    msg.classList.toggle('is-empty', !it.message);

    updateDrawerStatusButtons(it.status);

    var subject = it.form_type === 'case_study_request' && meta.case_study_title
      ? 'Your Evntiqa case study: ' + meta.case_study_title
      : it.form_type === 'calendar_request'
        ? 'Your 2027 CISO Roundtable Calendar'
        : 'Your Evntiqa consultation request';
    $('d-reply').href = 'mailto:' + encodeURIComponent(it.email) + '?subject=' + encodeURIComponent(subject);

    $('drawer-backdrop').hidden = false;
    $('drawer').classList.add('is-open');
    $('drawer').setAttribute('aria-hidden', 'false');
  }

  function updateDrawerStatusButtons(status) {
    document.querySelectorAll('#d-status .status-btn').forEach(function (btn) {
      var active = btn.getAttribute('data-status') === status;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });
  }

  function closeDrawer() {
    $('drawer').classList.remove('is-open');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('drawer-backdrop').hidden = true;
    state.currentSubmission = null;
  }

  // =========================================================================
  // REFERENCE DATA (Authors & Categories)
  // =========================================================================
  function loadReferenceData() {
    return Promise.all([
      requestJson(API_ADMIN_AUTHORS),
      requestJson(API_ADMIN_CATEGORIES)
    ]).then(function (results) {
      state.authors = results[0] || [];
      state.categories = results[1] || [];
      populateAuthorSelect();
      populateCategorySelect();
    }).catch(function (err) {
      console.error('Failed to load authors/categories:', err);
    });
  }

  function populateAuthorSelect() {
    var sel = $('ed-author-select');
    var val = sel.value;
    sel.innerHTML = '<option value="">-- No Author (General Editorial) --</option>';
    state.authors.forEach(function (a) {
      var opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name + (a.designation ? ' (' + a.designation + ')' : '');
      sel.appendChild(opt);
    });
    if (val) sel.value = val;
  }

  function populateCategorySelect() {
    var sel = $('ed-category-select');
    var val = sel.value;
    sel.innerHTML = '<option value="">-- Select Category --</option>';
    state.categories.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    if (val) sel.value = val;
  }

  // =========================================================================
  // EDITORIAL LIST VIEW (Image 2)
  // =========================================================================
  function refreshEditorialList() {
    $('ed-list-error').hidden = true;
    var params = new URLSearchParams({
      limit: ED_PAGE_SIZE,
      offset: (state.edPage - 1) * ED_PAGE_SIZE,
      sort_by: state.edSortBy,
      sort_order: state.edSortOrder
    });
    if (state.edTypeFilter) params.set('type', state.edTypeFilter);
    if (state.edStatusFilter) params.set('status', state.edStatusFilter);
    if (state.edSearchQuery) params.set('q', state.edSearchQuery);

    requestJson(API_ADMIN_CONTENT + '?' + params.toString())
      .then(function (data) {
        state.edTotal = data.total;
        state.edItems = data.items;
        renderEditorialTable();
        renderEditorialPager();
      })
      .catch(function (err) {
        if (err.message !== 'unauthorized') {
          $('ed-list-error').textContent = 'Could not load content: ' + err.message;
          $('ed-list-error').hidden = false;
        }
      });
  }

  function renderEditorialTable() {
    var tbody = $('ed-rows');
    tbody.innerHTML = '';
    var items = state.edItems;
    $('ed-empty').hidden = items.length > 0;

    items.forEach(function (it) {
      var tr = document.createElement('tr');

      // 1. Primary Feature (Star)
      var tdStar = document.createElement('td');
      var starBtn = document.createElement('button');
      starBtn.type = 'button';
      starBtn.className = 'star-btn' + (it.is_primary_featured ? ' is-featured' : '');
      starBtn.title = it.is_primary_featured ? 'Homepage Featured (Click to toggle off)' : 'Set as Homepage Featured';
      starBtn.innerHTML = it.is_primary_featured ? '★' : '☆';
      starBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFeatured(it.id, it.title, it.is_primary_featured);
      });
      tdStar.appendChild(starBtn);

      // 2. Title & Topic
      var tdTitle = document.createElement('td');
      var titleBlock = document.createElement('div');
      titleBlock.className = 'item-title-block';
      var titleText = document.createElement('span');
      titleText.className = 'item-title';
      titleText.textContent = it.title;

      var topicRow = document.createElement('div');
      topicRow.className = 'item-topic-row';
      var catName = it.category ? it.category.name : 'GENERAL';
      var catSpan = document.createElement('span');
      catSpan.className = 'topic-tag';
      catSpan.textContent = catName;

      var slugSpan = document.createElement('span');
      slugSpan.className = 'slug-tag';
      slugSpan.textContent = '• /' + it.slug;

      topicRow.appendChild(catSpan);
      topicRow.appendChild(slugSpan);

      titleBlock.appendChild(titleText);
      titleBlock.appendChild(topicRow);
      tdTitle.appendChild(titleBlock);

      // 3. Type
      var tdType = document.createElement('td');
      var typeBadge = document.createElement('span');
      typeBadge.className = 'badge-type';
      typeBadge.textContent = it.type;
      tdType.appendChild(typeBadge);

      // 4. Author Attribution
      var tdAuthor = document.createElement('td');
      var authorCell = document.createElement('div');
      authorCell.className = 'author-cell';
      if (it.author) {
        if (it.author.avatar_url) {
          var av = document.createElement('img');
          av.src = it.author.avatar_url;
          av.className = 'author-avatar-img';
          av.alt = it.author.name;
          authorCell.appendChild(av);
        } else {
          var avPlaceholder = document.createElement('div');
          avPlaceholder.className = 'author-avatar-placeholder';
          avPlaceholder.textContent = (it.author.name || 'A').slice(0, 2).toUpperCase();
          authorCell.appendChild(avPlaceholder);
        }
        var authorText = document.createElement('div');
        authorText.className = 'author-text';
        var strong = document.createElement('strong');
        strong.textContent = it.author.name;
        var small = document.createElement('small');
        small.textContent = it.author.designation || 'Author';
        authorText.appendChild(strong);
        authorText.appendChild(small);
        authorCell.appendChild(authorText);
      } else {
        var unassigned = document.createElement('span');
        unassigned.className = 'muted';
        unassigned.textContent = '– No Author –';
        authorCell.appendChild(unassigned);
      }
      tdAuthor.appendChild(authorCell);

      // 5. Status
      var tdStatus = document.createElement('td');
      var statusBadge = document.createElement('span');
      var stLower = (it.status || 'draft').toLowerCase();
      statusBadge.className = 'badge-status badge-status-' + stLower;
      statusBadge.textContent = it.status;
      tdStatus.appendChild(statusBadge);

      // 6. Reads
      var tdReads = document.createElement('td');
      tdReads.textContent = Number(it.views_count || 0).toLocaleString();

      // 7. Actions
      var tdActions = document.createElement('td');
      tdActions.style.textAlign = 'right';
      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'action-btns';

      var viewBtn = document.createElement('a');
      viewBtn.className = 'row-action-btn';
      viewBtn.title = 'View live article';
      viewBtn.target = '_blank';
      viewBtn.rel = 'noopener';
      viewBtn.href = 'http://localhost:8080/article.html?slug=' + encodeURIComponent(it.slug);
      viewBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
      viewBtn.addEventListener('click', function (e) {
        e.stopPropagation();
      });

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'row-action-btn';
      editBtn.title = 'Edit item';
      editBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
      editBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openEditor(it.id);
      });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'row-action-btn btn-delete';
      delBtn.title = 'Delete item';
      delBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteEditorialItem(it.id, it.title);
      });

      actionsDiv.appendChild(viewBtn);
      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(delBtn);
      tdActions.appendChild(actionsDiv);

      tr.appendChild(tdStar);
      tr.appendChild(tdTitle);
      tr.appendChild(tdType);
      tr.appendChild(tdAuthor);
      tr.appendChild(tdStatus);
      tr.appendChild(tdReads);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  }

  function renderEditorialPager() {
    var pages = Math.max(1, Math.ceil(state.edTotal / ED_PAGE_SIZE));
    $('ed-pager-info').textContent = state.edTotal === 0 ? '' : 'Showing 1-' + state.edItems.length + ' of ' + state.edTotal + ' content items';
    $('ed-prev-btn').disabled = state.edPage <= 1;
    $('ed-next-btn').disabled = state.edPage >= pages;
  }

  function toggleFeatured(id, title, currentlyFeatured) {
    requestJson(API_ADMIN_CONTENT + '/' + id + '/set-primary-featured', { method: 'POST' })
      .then(function (res) {
        if (res.is_primary_featured) {
          toast('"' + title + '" is now set as the Homepage Featured item.');
        } else {
          toast('"' + title + '" is no longer featured.');
        }
        refreshEditorialList();
      })
      .catch(function (err) {
        toast('Failed to update featured content: ' + err.message, true);
      });
  }

  function deleteEditorialItem(id, title) {
    if (!confirm('Are you sure you want to delete "' + title + '"?\n\nThis action cannot be undone.')) return;
    request(API_ADMIN_CONTENT + '/' + id, { method: 'DELETE' })
      .then(function () {
        toast('"' + title + '" deleted successfully.');
        refreshEditorialList();
      })
      .catch(function (err) {
        toast('Failed to delete item: ' + err.message, true);
      });
  }

  // =========================================================================
  // EDITORIAL WORKSPACE / EDITOR (Image 1)
  // =========================================================================
  function initQuill() {
    if (state.quill) return;
    if (typeof Quill === 'undefined') {
      console.warn('Quill not loaded yet.');
      return;
    }
    state.quill = new Quill('#quill-editor', {
      theme: 'snow',
      modules: {
        toolbar: '#quill-toolbar'
      },
      placeholder: 'Write your post... use the toolbar to add hyperlinks, images, and YouTube videos.'
    });

    // Auto-save draft listener
    state.quill.on('text-change', function () {
      scheduleDraftSave();
    });
  }

  function openEditor(id) {
    state.edView = 'editor';
    state.edEditingId = id || null;
    $('editorial-list-subview').hidden = true;
    $('editorial-editor-subview').hidden = false;

    initQuill();
    resetEditorForm();

    if (id) {
      $('ed-editor-title').textContent = 'EDIT EDITORIAL ITEM';
      $('ed-save-label').textContent = 'SAVE CHANGES';
      requestJson(API_ADMIN_CONTENT + '/' + id)
        .then(function (item) {
          populateEditor(item);
        })
        .catch(function (err) {
          toast('Could not load content for editing: ' + err.message, true);
          closeEditor();
        });
    } else {
      $('ed-editor-title').textContent = 'NEW EDITORIAL ITEM';
      $('ed-save-label').textContent = 'CREATE & PUBLISH';
      checkRestoredDraft();
    }
  }

  function closeEditor() {
    state.edView = 'list';
    state.edEditingId = null;
    $('editorial-editor-subview').hidden = true;
    $('editorial-list-subview').hidden = false;
    $('ed-draft-banner').hidden = true;
    refreshEditorialList();
  }

  function resetEditorForm() {
    $('editorial-form').reset();
    $('ed-slug').value = '';
    $('ed-cover-url').value = '';
    $('ed-cover-preview').src = '';
    $('ed-cover-preview-wrap').hidden = true;
    $('ed-remove-cover-btn').hidden = true;
    $('ed-featured-checkbox').checked = false;
    $('ed-type').value = 'ARTICLE';
    $('ed-status').value = 'PUBLISHED';
    $('ed-faqs-container').innerHTML = '';
    state.faqs = [];

    // Set published date to now
    var now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    $('ed-published-at').value = now.toISOString().slice(0, 16);

    if (state.quill) {
      state.quill.root.innerHTML = '';
    }
  }

  function populateEditor(item) {
    $('ed-title').value = item.title || '';
    $('ed-slug').value = item.slug || '';
    $('ed-brief').value = item.brief || '';
    $('ed-type').value = item.type || 'ARTICLE';
    $('ed-status').value = item.status || 'DRAFT';
    $('ed-featured-checkbox').checked = !!item.is_primary_featured;

    if (item.published_at) {
      var d = new Date(item.published_at);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      $('ed-published-at').value = d.toISOString().slice(0, 16);
    }

    if (item.author_id) $('ed-author-select').value = item.author_id;
    if (item.category_id) $('ed-category-select').value = item.category_id;

    if (item.cover_image_url) {
      $('ed-cover-url').value = item.cover_image_url;
      $('ed-cover-preview').src = item.cover_image_url;
      $('ed-cover-preview-wrap').hidden = false;
      $('ed-remove-cover-btn').hidden = false;
    }

    $('ed-meta-title').value = item.meta_title || '';
    $('ed-meta-desc').value = item.meta_description || '';
    $('ed-canonical-url').value = item.canonical_url || '';

    if (state.quill) {
      state.quill.root.innerHTML = item.content || '';
    }

    state.faqs = item.faqs || [];
    renderFaqs();
  }

  // Cover Image Handling
  function convertCoverUrl() {
    var url = $('ed-cover-url').value.trim();
    if (!url) return;
    if (url.startsWith('/uploads/')) {
      $('ed-cover-preview').src = url;
      $('ed-cover-preview-wrap').hidden = false;
      $('ed-remove-cover-btn').hidden = false;
      return;
    }
    toast('Downloading and converting cover to WebP...');
    requestJson(API_ADMIN_MEDIA + '/process-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    })
      .then(function (res) {
        $('ed-cover-url').value = res.url;
        $('ed-cover-preview').src = res.url;
        $('ed-cover-preview-wrap').hidden = false;
        $('ed-remove-cover-btn').hidden = false;
        toast('Cover image converted to WebP successfully!');
      })
      .catch(function (err) {
        toast('Image processing failed: ' + err.message, true);
      });
  }

  function uploadCoverFile(file) {
    if (!file) return;
    var fd = new FormData();
    fd.append('file', file);
    toast('Uploading and converting image...');
    requestJson(API_ADMIN_MEDIA + '/upload', {
      method: 'POST',
      body: fd
    })
      .then(function (res) {
        $('ed-cover-url').value = res.url;
        $('ed-cover-preview').src = res.url;
        $('ed-cover-preview-wrap').hidden = false;
        $('ed-remove-cover-btn').hidden = false;
        toast('Image uploaded and optimized!');
      })
      .catch(function (err) {
        toast('Upload failed: ' + err.message, true);
      });
  }

  // FAQs Manager
  function addFaqItem(q, a) {
    state.faqs.push({ q: q || '', a: a || '' });
    renderFaqs();
  }

  function renderFaqs() {
    var c = $('ed-faqs-container');
    c.innerHTML = '';
    state.faqs.forEach(function (faq, idx) {
      var card = document.createElement('div');
      card.className = 'faq-item-card';

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'faq-delete-btn';
      delBtn.innerHTML = '✕';
      delBtn.title = 'Remove FAQ';
      delBtn.addEventListener('click', function () {
        state.faqs.splice(idx, 1);
        renderFaqs();
      });

      var qInput = document.createElement('input');
      qInput.type = 'text';
      qInput.className = 'input';
      qInput.placeholder = 'Question ' + (idx + 1);
      qInput.value = faq.q;
      qInput.addEventListener('input', function () { faq.q = qInput.value; scheduleDraftSave(); });

      var aInput = document.createElement('textarea');
      aInput.className = 'input textarea';
      aInput.rows = 2;
      aInput.placeholder = 'Answer...';
      aInput.value = faq.a;
      aInput.addEventListener('input', function () { faq.a = aInput.value; scheduleDraftSave(); });

      card.appendChild(delBtn);
      card.appendChild(qInput);
      card.appendChild(aInput);
      c.appendChild(card);
    });
  }

  // Draft Auto-Save
  var draftTimer = null;
  function scheduleDraftSave() {
    if (state.edView !== 'editor') return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      var key = state.edEditingId ? 'evntiqa_draft_edit_' + state.edEditingId : 'evntiqa_draft_new_content';
      var data = getEditorPayload();
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e) {}
    }, 1200);
  }

  function checkRestoredDraft() {
    if (state.edEditingId) return;
    try {
      var saved = localStorage.getItem('evntiqa_draft_new_content');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && (parsed.title || parsed.content)) {
          $('ed-draft-banner').hidden = false;
          populateEditor(parsed);
        }
      }
    } catch (e) {}
  }

  function discardDraft() {
    var key = state.edEditingId ? 'evntiqa_draft_edit_' + state.edEditingId : 'evntiqa_draft_new_content';
    localStorage.removeItem(key);
    $('ed-draft-banner').hidden = true;
    resetEditorForm();
  }

  function getEditorPayload() {
    var title = $('ed-title').value.trim();
    var slug = $('ed-slug').value.trim() || slugify(title);
    var content = state.quill ? state.quill.root.innerHTML : '';
    var pubDate = $('ed-published-at').value;

    return {
      title: title,
      slug: slug,
      brief: $('ed-brief').value.trim() || null,
      content: content,
      type: $('ed-type').value,
      status: $('ed-status').value,
      is_primary_featured: $('ed-featured-checkbox').checked,
      author_id: $('ed-author-select').value || null,
      category_id: $('ed-category-select').value || null,
      cover_image_url: $('ed-cover-url').value.trim() || null,
      published_at: pubDate ? new Date(pubDate).toISOString() : null,
      faqs: state.faqs.filter(function (f) { return f.q.trim() && f.a.trim(); }),
      meta_title: $('ed-meta-title').value.trim() || null,
      meta_description: $('ed-meta-desc').value.trim() || null,
      canonical_url: $('ed-canonical-url').value.trim() || null
    };
  }

  function saveEditorialItem() {
    var payload = getEditorPayload();
    if (!payload.title || payload.title.length < 3) {
      toast('Please enter a headline / title (at least 3 characters).', true);
      $('ed-title').focus();
      return;
    }
    if (!payload.content || payload.content === '<p><br></p>') {
      toast('Please enter some article content in the editor.', true);
      return;
    }

    var saveBtn = $('ed-save-btn');
    saveBtn.disabled = true;
    toast('Saving and sanitizing article...');

    var isEdit = Boolean(state.edEditingId);
    var url = isEdit ? API_ADMIN_CONTENT + '/' + state.edEditingId : API_ADMIN_CONTENT;
    var method = isEdit ? 'PATCH' : 'POST';

    requestJson(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        toast('Article "' + res.title + '" saved successfully!');
        var draftKey = isEdit ? 'evntiqa_draft_edit_' + state.edEditingId : 'evntiqa_draft_new_content';
        localStorage.removeItem(draftKey);
        closeEditor();
      })
      .catch(function (err) {
        toast('Failed to save article: ' + err.message, true);
      })
      .finally(function () {
        saveBtn.disabled = false;
      });
  }

  // =========================================================================
  // QUICK ADD MODALS (Author & Category)
  // =========================================================================
  function openAuthorModal() {
    $('author-form').reset();
    $('author-modal').hidden = false;
    $('author-name').focus();
  }
  function closeAuthorModal() {
    $('author-modal').hidden = true;
  }
  function submitAuthorModal(e) {
    e.preventDefault();
    var payload = {
      name: $('author-name').value.trim(),
      designation: $('author-designation').value.trim() || null,
      email: $('author-email').value.trim() || null,
      avatar_url: $('author-avatar').value.trim() || null,
      description: $('author-desc').value.trim() || ''
    };
    if (!payload.name) return;
    requestJson(API_ADMIN_AUTHORS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (newAuthor) {
      state.authors.push(newAuthor);
      populateAuthorSelect();
      $('ed-author-select').value = newAuthor.id;
      closeAuthorModal();
      toast('Author "' + newAuthor.name + '" added!');
    }).catch(function (err) {
      toast('Could not create author: ' + err.message, true);
    });
  }

  function openCategoryModal() {
    $('category-form').reset();
    $('category-modal').hidden = false;
    $('category-name').focus();
  }
  function closeCategoryModal() {
    $('category-modal').hidden = true;
  }
  function submitCategoryModal(e) {
    e.preventDefault();
    var name = $('category-name').value.trim();
    var slug = $('category-slug').value.trim() || slugify(name);
    var desc = $('category-desc').value.trim() || null;
    if (!name) return;
    requestJson(API_ADMIN_CATEGORIES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, slug: slug, description: desc })
    }).then(function (newCat) {
      state.categories.push(newCat);
      populateCategorySelect();
      $('ed-category-select').value = newCat.id;
      closeCategoryModal();
      toast('Category "' + newCat.name + '" added!');
    }).catch(function (err) {
      toast('Could not create category: ' + err.message, true);
    });
  }

  // =========================================================================
  // EVENT LISTENERS BINDING
  // =========================================================================
  document.addEventListener('DOMContentLoaded', function () {
    // Auth Form
    $('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      signIn($('login-email').value.trim(), $('login-password').value);
    });

    $('logout-btn').addEventListener('click', signOut);

    // Refresh button
    $('refresh-btn').addEventListener('click', function () {
      if (state.currentTab === 'forms') refreshSubmissions();
      else refreshEditorialList();
    });

    // Topbar portal tabs
    $('nav-forms-btn').addEventListener('click', function () { switchPortalTab('forms'); });
    $('nav-editorial-btn').addEventListener('click', function () { switchPortalTab('editorial'); });

    // Submissions interactions
    function setFormFilter(formType) {
      document.querySelectorAll('[data-form]').forEach(function (b) {
        var match = (b.getAttribute('data-form') || '') === (formType || '');
        b.classList.toggle('is-active', match);
        b.setAttribute('aria-selected', String(match));
      });
      state.formType = formType || '';
      state.page = 1;
      refreshSubmissions();
    }

    document.querySelectorAll('[data-form]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setFormFilter(btn.getAttribute('data-form'));
      });
    });

    // Make summary stats cards interactive quick-filters
    document.querySelectorAll('.stats .stat').forEach(function (card) {
      card.addEventListener('click', function () {
        var statValueEl = card.querySelector('[data-stat]');
        if (!statValueEl) return;
        var statKey = statValueEl.getAttribute('data-stat');
        if (statKey === 'total') {
          setFormFilter('');
          $('status-filter').value = '';
          state.status = '';
          state.page = 1;
          refreshSubmissions();
        } else if (statKey === 'new') {
          $('status-filter').value = 'new';
          state.status = 'new';
          state.page = 1;
          refreshSubmissions();
        } else if (FORM_LABELS[statKey]) {
          setFormFilter(statKey);
        }
      });
    });

    $('status-filter').addEventListener('change', function (e) {
      state.status = e.target.value;
      state.page = 1;
      refreshSubmissions();
    });

    $('search').addEventListener('input', function (e) {
      clearTimeout($('search')._t);
      $('search')._t = setTimeout(function () {
        state.q = e.target.value.trim();
        state.page = 1;
        refreshSubmissions();
      }, 200);
    });

    $('prev-btn').addEventListener('click', function () { if (state.page > 1) { state.page--; refreshSubmissions(); } });
    $('next-btn').addEventListener('click', function () { state.page++; refreshSubmissions(); });

    $('drawer-close').addEventListener('click', closeDrawer);
    $('drawer-backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('drawer').classList.contains('is-open')) closeDrawer();
    });

    document.querySelectorAll('#d-status .status-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!state.currentSubmission) return;
        var newStatus = btn.getAttribute('data-status');
        if (state.currentSubmission.status === newStatus) return;

        var prevStatus = state.currentSubmission.status;
        state.currentSubmission.status = newStatus;
        updateDrawerStatusButtons(newStatus);

        requestJson(API_SUBMISSIONS + '/' + state.currentSubmission.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        }).then(function (updated) {
          state.currentSubmission.status = updated.status;
          updateDrawerStatusButtons(updated.status);

          var item = state.items.find(function (r) { return r.id === updated.id; });
          if (item) {
            item.status = updated.status;
            renderSubmissionsTable();
          } else {
            refreshSubmissions();
          }
          loadSubmissionsStats();
          toast('Marked as ' + (STATUS_LABELS[updated.status] || updated.status).toLowerCase());
        }).catch(function (err) {
          state.currentSubmission.status = prevStatus;
          updateDrawerStatusButtons(prevStatus);
          toast(err.message, true);
        });
      });
    });

    $('export-btn').addEventListener('click', function () {
      var p = new URLSearchParams();
      if (state.formType) p.set('form_type', state.formType);
      if (state.status) p.set('status', state.status);
      if (state.q) p.set('q', state.q);
      window.location.href = API_SUBMISSIONS + '/export.csv?' + p.toString();
    });

    // Editorial Content interactions
    $('add-content-btn').addEventListener('click', function () { openEditor(null); });
    $('ed-cancel-btn').addEventListener('click', closeEditor);
    $('ed-cancel-btn-top').addEventListener('click', closeEditor);
    $('ed-save-btn').addEventListener('click', saveEditorialItem);
    $('ed-discard-draft-btn').addEventListener('click', discardDraft);

    // Auto-generate slug as user types title
    $('ed-title').addEventListener('input', function (e) {
      if (!state.edEditingId && (!$('ed-slug').value || $('ed-slug').dataset.auto === 'true')) {
        $('ed-slug').value = slugify(e.target.value);
        $('ed-slug').dataset.auto = 'true';
      }
      scheduleDraftSave();
    });
    $('ed-slug').addEventListener('input', function () {
      $('ed-slug').dataset.auto = 'false';
      scheduleDraftSave();
    });

    // Inputs auto-save triggers
    $('ed-brief').addEventListener('input', scheduleDraftSave);
    $('ed-meta-title').addEventListener('input', scheduleDraftSave);
    $('ed-meta-desc').addEventListener('input', scheduleDraftSave);
    $('ed-canonical-url').addEventListener('input', scheduleDraftSave);
    $('ed-type').addEventListener('change', scheduleDraftSave);
    $('ed-status').addEventListener('change', scheduleDraftSave);
    $('ed-author-select').addEventListener('change', scheduleDraftSave);
    $('ed-category-select').addEventListener('change', scheduleDraftSave);
    $('ed-featured-checkbox').addEventListener('change', scheduleDraftSave);

    // Cover image triggers
    $('ed-convert-cover-btn').addEventListener('click', convertCoverUrl);
    $('ed-cover-file').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) {
        uploadCoverFile(e.target.files[0]);
      }
    });
    $('ed-remove-cover-btn').addEventListener('click', function () {
      $('ed-cover-url').value = '';
      $('ed-cover-preview').src = '';
      $('ed-cover-preview-wrap').hidden = true;
      $('ed-remove-cover-btn').hidden = true;
      scheduleDraftSave();
    });

    // FAQs add
    $('ed-add-faq-btn').addEventListener('click', function () { addFaqItem('', ''); });

    // Filter bar (Image 2)
    $('ed-type-filter').addEventListener('change', function (e) {
      state.edTypeFilter = e.target.value;
      state.edPage = 1;
      refreshEditorialList();
    });
    $('ed-status-filter').addEventListener('change', function (e) {
      state.edStatusFilter = e.target.value;
      state.edPage = 1;
      refreshEditorialList();
    });
    $('ed-search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      state.edSearchQuery = $('ed-search-input').value.trim();
      state.edPage = 1;
      refreshEditorialList();
    });
    $('ed-search-input').addEventListener('input', function (e) {
      if (!e.target.value.trim() && state.edSearchQuery) {
        state.edSearchQuery = '';
        state.edPage = 1;
        refreshEditorialList();
      }
    });

    // Table sorting
    document.querySelectorAll('.th-sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var sortField = th.getAttribute('data-sort');
        if (state.edSortBy === sortField) {
          state.edSortOrder = state.edSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          state.edSortBy = sortField;
          state.edSortOrder = (sortField === 'title' || sortField === 'type' || sortField === 'author' || sortField === 'status') ? 'asc' : 'desc';
        }
        state.edPage = 1;
        refreshEditorialList();
      });
    });

    // Editorial Pagination
    $('ed-prev-btn').addEventListener('click', function () {
      if (state.edPage > 1) { state.edPage--; refreshEditorialList(); }
    });
    $('ed-next-btn').addEventListener('click', function () {
      state.edPage++; refreshEditorialList();
    });

    // Modals
    $('btn-open-author-modal').addEventListener('click', openAuthorModal);
    $('close-author-modal').addEventListener('click', closeAuthorModal);
    $('cancel-author-btn').addEventListener('click', closeAuthorModal);
    $('author-form').addEventListener('submit', submitAuthorModal);

    $('btn-open-category-modal').addEventListener('click', openCategoryModal);
    $('close-category-modal').addEventListener('click', closeCategoryModal);
    $('cancel-category-btn').addEventListener('click', closeCategoryModal);
    $('category-form').addEventListener('submit', submitCategoryModal);

    // Initial session verification
    checkSession();
  });
})();
