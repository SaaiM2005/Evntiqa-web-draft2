(function () {
  'use strict';

  var API = '/api/v1/submissions';
  var AUTH = '/api/v1/auth';
  var PAGE_SIZE = 25;

  var FORM_LABELS = {
    expert_consultation: 'Consultation',
    calendar_request: 'Calendar',
    case_study_request: 'Case study'
  };
  var OBJECTIVE_LABELS = {
    'roundtables': 'Virtual CISO Roundtables',
    'stalled-deals': 'Stalled account reactivation',
    'net-new': 'Net-new account penetration',
    'webinars': 'Webinars & summits',
    'custom': 'Custom ABM program'
  };
  var STATUS_LABELS = { new: 'New', contacted: 'Contacted', archived: 'Archived' };

  var state = { formType: '', status: '', q: '', page: 1, total: 0, items: [], current: null };

  var $ = function (id) { return document.getElementById(id); };

  // ---------- api (auth is the HttpOnly session cookie, sent automatically) ----------
  function request(path, opts) {
    opts = Object.assign({ credentials: 'same-origin' }, opts || {});
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) {
        showLogin('Your session has ended. Please sign in again.');
        throw new Error('unauthorized');
      }
      if (!res.ok) throw new Error('Request failed (' + res.status + ')');
      return res;
    });
  }

  function filterParams(extra) {
    var p = new URLSearchParams();
    if (state.formType) p.set('form_type', state.formType);
    if (state.status) p.set('status', state.status);
    if (state.q) p.set('q', state.q);
    Object.keys(extra || {}).forEach(function (k) { p.set(k, extra[k]); });
    return p.toString();
  }

  // ---------- formatting ----------
  var dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  var fullDateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function toast(message, isError) {
    var t = $('toast');
    t.textContent = message;
    t.classList.toggle('is-error', !!isError);
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ---------- views ----------
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
    refresh();
  }

  function checkSession() {
    fetch(AUTH + '/me', { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('signed out');
      return res.json();
    }).then(function (me) { showApp(me.email); }).catch(function () { showLogin(); });
  }

  function signIn(email, password) {
    var btn = $('login-btn');
    btn.disabled = true;
    $('login-error').hidden = true;
    fetch(AUTH + '/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      if (res.status === 401 || res.status === 422) throw new Error('Incorrect email or password.');
      if (res.status === 429) throw new Error('Too many attempts. Wait a minute and try again.');
      if (!res.ok) throw new Error('Sign-in failed (' + res.status + ').');
      checkSession();
    }).catch(function (err) {
      var msg = err instanceof TypeError ? 'Cannot reach the server.' : err.message;
      $('login-error').textContent = msg;
      $('login-error').hidden = false;
      $('login-password').value = '';
      $('login-password').focus();
    }).finally(function () { btn.disabled = false; });
  }

  function signOut() {
    fetch(AUTH + '/logout', { method: 'POST', credentials: 'same-origin' })
      .finally(function () { showLogin(); });
  }

  // ---------- data ----------
  function refresh() {
    loadStats();
    loadList();
  }

  function loadStats() {
    request(API + '/stats').then(function (r) { return r.json(); }).then(function (s) {
      setStat('total', s.total);
      Object.keys(s.by_form_type).forEach(function (k) { setStat(k, s.by_form_type[k]); });
      setStat('new', s.by_status.new);
    }).catch(function () { /* list shows the error */ });
  }

  function setStat(key, value) {
    var node = document.querySelector('[data-stat="' + key + '"]');
    if (node) node.textContent = Number(value).toLocaleString();
  }

  function loadList() {
    $('list-error').hidden = true;
    var query = filterParams({ page: state.page, page_size: PAGE_SIZE });
    return request(API + '?' + query).then(function (r) { return r.json(); }).then(function (data) {
      state.items = data.items;
      state.total = data.total;
      renderRows();
      renderPager();
    }).catch(function (err) {
      if (err.message === 'unauthorized') return;
      $('rows').replaceChildren();
      $('empty').hidden = true;
      $('list-error').textContent = 'Could not load responses. Is the API running? (' + err.message + ')';
      $('list-error').hidden = false;
    });
  }

  function renderRows() {
    var tbody = $('rows');
    tbody.replaceChildren();
    $('empty').hidden = state.items.length > 0;

    state.items.forEach(function (item) {
      var tr = el('tr');
      tr.tabIndex = 0;
      tr.dataset.id = item.id;

      tr.appendChild(el('td', 'cell-date', dateFmt.format(new Date(item.created_at))));
      var formTd = el('td');
      formTd.appendChild(el('span', 'badge badge-' + item.form_type, FORM_LABELS[item.form_type] || item.form_type));
      tr.appendChild(formTd);
      tr.appendChild(el('td', 'cell-name', item.name));
      tr.appendChild(el('td', null, item.company));
      tr.appendChild(el('td', 'cell-muted', item.email));
      tr.appendChild(el('td', 'cell-muted', OBJECTIVE_LABELS[item.objective] || item.objective || '—'));
      var statusTd = el('td');
      statusTd.appendChild(el('span', 'status-pill status-' + item.status, STATUS_LABELS[item.status]));
      tr.appendChild(statusTd);

      tr.addEventListener('click', function () { openDrawer(item); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(item); }
      });
      tbody.appendChild(tr);
    });
  }

  function renderPager() {
    var start = state.total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
    var end = Math.min(state.page * PAGE_SIZE, state.total);
    $('pager-info').textContent = state.total === 0 ? '' : start + '–' + end + ' of ' + state.total.toLocaleString();
    $('prev-btn').disabled = state.page <= 1;
    $('next-btn').disabled = end >= state.total;
  }

  // ---------- drawer ----------
  function addField(dl, label, value, href) {
    if (value == null || value === '') return;
    dl.appendChild(el('dt', null, label));
    var dd = el('dd');
    if (href) {
      var a = el('a', null, value);
      a.href = href;
      if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      dd.appendChild(a);
    } else {
      dd.textContent = value;
    }
    dl.appendChild(dd);
  }

  function safeHttpUrl(value) {
    try {
      var u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch (e) { return null; }
  }

  function openDrawer(item) {
    state.current = item;
    var meta = item.metadata || {};

    var badge = $('d-form');
    badge.className = 'badge badge-' + item.form_type;
    badge.textContent = FORM_LABELS[item.form_type] || item.form_type;
    $('d-name').textContent = item.name;
    $('d-sub').textContent = [item.job_title, item.company].filter(Boolean).join(' · ');

    var dl = $('d-fields');
    dl.replaceChildren();
    addField(dl, 'Email', item.email, 'mailto:' + item.email);
    addField(dl, 'Company', item.company);
    addField(dl, 'Job title', item.job_title);
    addField(dl, 'Program focus', OBJECTIVE_LABELS[item.objective] || item.objective);
    addField(dl, 'Case study', meta.case_study_title);
    addField(dl, 'Received', fullDateFmt.format(new Date(item.created_at)));
    addField(dl, 'Page', meta.page_url, safeHttpUrl(meta.page_url));
    addField(dl, 'Referrer', meta.referrer, safeHttpUrl(meta.referrer));
    var utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
      .filter(function (k) { return meta[k]; })
      .map(function (k) { return k.replace('utm_', '') + ': ' + meta[k]; })
      .join(' · ');
    addField(dl, 'UTM', utm);
    addField(dl, 'ID', item.id);

    var msg = $('d-message');
    msg.textContent = item.message || 'No message provided.';
    msg.classList.toggle('is-empty', !item.message);

    setDrawerStatus(item.status);

    var subject = item.form_type === 'case_study_request' && meta.case_study_title
      ? 'Your Evntiqa case study: ' + meta.case_study_title
      : item.form_type === 'calendar_request'
        ? 'Your 2027 CISO Roundtable Calendar'
        : 'Your Evntiqa consultation request';
    $('d-reply').href = 'mailto:' + encodeURIComponent(item.email) + '?subject=' + encodeURIComponent(subject);

    $('drawer-backdrop').hidden = false;
    var drawer = $('drawer');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    $('drawer-close').focus();
  }

  function closeDrawer() {
    var drawer = $('drawer');
    if (!drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    $('drawer-backdrop').hidden = true;
    var row = state.current && document.querySelector('tr[data-id="' + state.current.id + '"]');
    if (row) row.focus();
    state.current = null;
  }

  function setDrawerStatus(status) {
    document.querySelectorAll('#d-status .status-btn').forEach(function (btn) {
      var active = btn.dataset.status === status;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
      btn.setAttribute('role', 'radio');
    });
  }

  function updateStatus(status) {
    var item = state.current;
    if (!item || item.status === status) return;
    var previous = item.status;
    setDrawerStatus(status);
    request(API + '/' + item.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    }).then(function (r) { return r.json(); }).then(function (updated) {
      item.status = updated.status;
      toast('Marked as ' + STATUS_LABELS[updated.status].toLowerCase());
      renderRows();
      loadStats();
    }).catch(function (err) {
      if (err.message === 'unauthorized') return;
      setDrawerStatus(previous);
      toast('Could not update status', true);
    });
  }

  // ---------- export ----------
  function exportCsv() {
    var btn = $('export-btn');
    btn.disabled = true;
    request(API + '/export.csv?' + filterParams()).then(function (r) { return r.blob(); }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = el('a');
      a.href = url;
      a.download = 'evntiqa-responses-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }).catch(function (err) {
      if (err.message !== 'unauthorized') toast('Export failed', true);
    }).finally(function () { btn.disabled = false; });
  }

  // ---------- wiring ----------
  function init() {
    $('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      signIn($('login-email').value.trim(), $('login-password').value);
    });

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (t) {
          t.classList.toggle('is-active', t === tab);
          t.setAttribute('aria-selected', String(t === tab));
        });
        state.formType = tab.dataset.form;
        state.page = 1;
        loadList();
      });
    });

    $('status-filter').addEventListener('change', function (e) {
      state.status = e.target.value;
      state.page = 1;
      loadList();
    });

    var searchTimer;
    $('search').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.q = e.target.value.trim();
        state.page = 1;
        loadList();
      }, 250);
    });

    $('prev-btn').addEventListener('click', function () { state.page -= 1; loadList(); });
    $('next-btn').addEventListener('click', function () { state.page += 1; loadList(); });
    $('refresh-btn').addEventListener('click', function () { refresh(); toast('Refreshed'); });
    $('export-btn').addEventListener('click', exportCsv);
    $('logout-btn').addEventListener('click', function () { signOut(); });

    $('drawer-close').addEventListener('click', closeDrawer);
    $('drawer-backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
    document.querySelectorAll('#d-status .status-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { updateStatus(btn.dataset.status); });
    });

    checkSession();
  }

  init();
})();
