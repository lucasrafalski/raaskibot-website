/* RaaskiBot - comportamento do site. Sem dependencias. */
(function () {
	'use strict';

	var $  = function (s, r) { return (r || document).querySelector(s); };
	var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

	/* ------------------------------------------------------------ idioma -- */

	var LANGS = ['en', 'pt'];
	var lang  = localStorage.getItem('rb-lang');
	if (LANGS.indexOf(lang) === -1) {
		lang = (navigator.language || 'en').toLowerCase().indexOf('pt') === 0 ? 'pt' : 'en';
	}

	function applyLang(next) {
		lang = next;
		localStorage.setItem('rb-lang', next);
		document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en';

		$$('[data-en][data-pt]').forEach(function (el) {
			var text = el.getAttribute('data-' + next);
			if (text !== null) { el.innerHTML = text; }
		});

		/* Campos de formulario nao tem innerHTML util - traduz o placeholder. */
		$$('[data-en-ph][data-pt-ph]').forEach(function (el) {
			var ph = el.getAttribute('data-' + next + '-ph');
			if (ph !== null) { el.placeholder = ph; el.setAttribute('aria-label', ph); }
		});

		/* Rotulo do "clique para ampliar" nas screenshots. */
		$$('[data-en-zoom][data-pt-zoom]').forEach(function (el) {
			el.dataset.zoom = el.getAttribute('data-' + next + '-zoom') || '';
		});

		$$('.lang button').forEach(function (b) {
			b.setAttribute('aria-pressed', String(b.dataset.lang === next));
		});

		syncSearchIndex();
		applySearch($('#search') ? $('#search').value : '');
	}

	/* -------------------------------------------------------------- abas -- */

	function showView(name, opts) {
		var found = false;
		$$('.view').forEach(function (v) {
			var on = v.dataset.view === name;
			v.classList.toggle('is-active', on);
			if (on) { found = true; }
		});
		if (!found) { return false; }

		$$('.tab[data-view]').forEach(function (t) {
			t.setAttribute('aria-selected', String(t.dataset.view === name));
		});
		closeDrawer();
		if (!opts || !opts.keepScroll) { window.scrollTo(0, 0); }
		return true;
	}

	$$('.tab[data-view]').forEach(function (tab) {
		tab.addEventListener('click', function () {
			var name = tab.dataset.view;
			showView(name);
			history.replaceState(null, '', '#' + name);
			if (name === 'tutorials') { updateCurrent(); }
		});
	});

	/* Resolve o hash: aceita "#patch-notes" (aba) e "#attack" (ancora de secao,
	   o formato de link que o site antigo usava e que pode estar salvo por ai).

	   A ancora e testada ANTES de showView(id): showView desliga todas as views
	   antes de descobrir que nao achou nenhuma, e uma view escondida nao tem
	   altura, entao a rolagem para a secao acabaria em zero. */
	function scrollTo(target) {
		var top = target.getBoundingClientRect().top + window.scrollY
			- parseInt(getComputedStyle(document.documentElement).scrollPaddingTop, 10);
		/* Instantaneo: quem abre um link direto para a secao nao quer assistir
		   a pagina rolar 2000px. Cliques dentro da pagina seguem animados. */
		window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
		updateCurrent();
	}

	/* Os nomes das views passaram para o ingles. Links em portugues ja
	   circulavam, entao continuam valendo em vez de cair na home. */
	var ANTIGOS = { tutoriais: 'tutorials', ajuda: 'troubleshooting', contato: 'contact' };

	function routeFromHash() {
		var id = decodeURIComponent(location.hash.replace(/^#/, ''));
		if (ANTIGOS[id]) { id = ANTIGOS[id]; }
		if (!id) { showView('home'); return; }

		var target = document.getElementById(id);
		if (target) {
			var view = target.closest('.view');
			showView(view ? view.dataset.view : 'home', { keepScroll: true });
			requestAnimationFrame(function () { scrollTo(target); });
			return;
		}

		if (!showView(id)) { showView('home'); }
	}

	/* ------------------------------------- sidebar: scroll-spy + gaveta -- */

	var links    = $$('.sidebar a[href^="#"]');
	var sections = links
		.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
		.filter(Boolean);

	function updateCurrent() {
		if (!sections.length) { return; }
		var line = window.scrollY + parseInt(getComputedStyle(document.documentElement).scrollPaddingTop, 10) + 8;
		var current = sections[0];

		for (var i = 0; i < sections.length; i++) {
			if (sections[i].offsetTop <= line) { current = sections[i]; } else { break; }
		}
		/* No fim da pagina, marca a ultima secao visivel. */
		if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 4) {
			current = sections[sections.length - 1];
		}

		links.forEach(function (a) {
			a.classList.toggle('is-current', a.getAttribute('href') === '#' + current.id);
		});
	}

	var ticking = false;
	window.addEventListener('scroll', function () {
		if (ticking) { return; }
		ticking = true;
		requestAnimationFrame(function () { updateCurrent(); ticking = false; });
	}, { passive: true });

	var sidebar = $('.sidebar');
	var scrim   = $('.scrim');
	var toggle  = $('.drawer-toggle');

	function closeDrawer() {
		if (sidebar) { sidebar.classList.remove('is-open'); }
		if (scrim)   { scrim.classList.remove('is-open'); }
		if (toggle)  { toggle.setAttribute('aria-expanded', 'false'); }
	}

	if (toggle) {
		toggle.addEventListener('click', function () {
			var open = !sidebar.classList.contains('is-open');
			sidebar.classList.toggle('is-open', open);
			scrim.classList.toggle('is-open', open);
			toggle.setAttribute('aria-expanded', String(open));
		});
	}
	if (scrim) { scrim.addEventListener('click', closeDrawer); }
	links.forEach(function (a) { a.addEventListener('click', closeDrawer); });

	/* ------------------------------------------------------------- busca -- */

	/* Indexa titulo da secao + corpo, para achar "delay" mesmo fora do titulo. */
	var index = [];
	function syncSearchIndex() {
		index = links.map(function (a) {
			var sec = document.getElementById(a.getAttribute('href').slice(1));
			return {
				link: a,
				item: a.closest('li'),
				text: ((a.textContent || '') + ' ' + (sec ? sec.textContent || '' : '')).toLowerCase()
			};
		});
	}

	function applySearch(raw) {
		var q = (raw || '').trim().toLowerCase();
		var hits = 0;

		index.forEach(function (entry) {
			var on = !q || entry.text.indexOf(q) !== -1;
			if (entry.item) { entry.item.classList.toggle('is-hidden', !on); }
			if (on) { hits++; }
		});

		/* Esconde o rotulo de um grupo quando nenhum item dele sobrou. */
		$$('.nav-group').forEach(function (g) {
			var visible = $$('li', g).some(function (li) { return !li.classList.contains('is-hidden'); });
			g.classList.toggle('is-hidden', !visible);
		});

		if (sidebar) { sidebar.classList.toggle('is-empty', hits === 0); }
	}

	var search = $('#search');
	if (search) {
		search.addEventListener('input', function () { applySearch(search.value); });
		search.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') { search.value = ''; applySearch(''); }
		});
	}

	/* ---------------------------------------------------------- lightbox -- */

	var box     = $('.lightbox');
	var boxImg  = box ? $('img', box) : null;
	var lastFocus = null;

	function openBox(src, alt) {
		if (!box) { return; }
		lastFocus = document.activeElement;
		boxImg.src = src;
		boxImg.alt = alt || '';
		box.classList.add('is-open');
		document.body.style.overflow = 'hidden';
		$('.lightbox-close', box).focus();
	}

	function closeBox() {
		if (!box) { return; }
		box.classList.remove('is-open');
		boxImg.removeAttribute('src');
		document.body.style.overflow = '';
		if (lastFocus) { lastFocus.focus(); }
	}

	document.addEventListener('click', function (e) {
		var shot = e.target.closest ? e.target.closest('.shot') : null;
		if (shot) {
			var img = $('img', shot);
			if (img) { openBox(img.currentSrc || img.src, img.alt); }
		}
	});

	if (box) {
		box.addEventListener('click', closeBox);
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && box.classList.contains('is-open')) { closeBox(); }
		});
	}

	/* --------------------------------------------------------------- init -- */

	$$('.lang button').forEach(function (b) {
		b.addEventListener('click', function () { applyLang(b.dataset.lang); });
	});

	window.addEventListener('hashchange', routeFromHash);

	/* O navegador tentaria restaurar a rolagem anterior por cima da nossa. */
	if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }

	applyLang(lang);
	routeFromHash();
	updateCurrent();

	/* Fontes e imagens mudam a altura das secoes depois do primeiro paint;
	   reposiciona uma vez que tudo tenha carregado. */
	window.addEventListener('load', function () {
		var id = decodeURIComponent(location.hash.replace(/^#/, ''));
		var target = id && document.getElementById(id);
		if (target) { scrollTo(target); }
		updateCurrent();
	});
})();
