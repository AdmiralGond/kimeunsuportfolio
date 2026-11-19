(() => {
    'use strict';
    const M = JSON.parse(document.getElementById('portfolio-data').textContent);
    const $ = id => document.getElementById(id);
    const ORDER = M.pages, CODES = M.pageCodes, SCALE = M.cameraScale || 9.2, VX = 952.5, VY = 455.5;
    const GUIDE = '키워드 버튼 위에 마우스 포인터를 올리거나 버튼을 누르면 해당 키워드의 내용이 여기에 표시됩니다.';
    const NAV = [['프로필', 0], ['소개', 1], ['게임을 개발하고,', 2], ['게임을 플레이하며,', 3], ['게임을 관찰한다.', 4], ['1인 게임 개발 프로젝트', 5], ['기획 문서 작성 이력', 7], [M.strings['string_history_1.csv'][0][1], 8]];
    const escapeHTML = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function rich(v) {
        const raw = String(v), pattern = /\[((?:\\.|[^\]\\])*)\]\((https:\/\/[^\s)]+)\)/g;
        let result = '', start = 0, match;
        while ((match = pattern.exec(raw)) !== null) {
            result += escapeHTML(raw.slice(start, match.index));
            const label = escapeHTML(match[1].replace(/\\([\[\]])/g, '$1'));
            result += '<a target="_blank" rel="noopener noreferrer" href="' + escapeHTML(match[2]) + '">' + label + '</a>';
            start = pattern.lastIndex;
        }
        result += escapeHTML(raw.slice(start));
        result = result.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
        return result.split('<br>').map(line => /[\u3040-\u30ff]/.test(line) ? '<span lang="ja" class="jp-quote">' + line + '</span>' : /[ō]/.test(line) ? '<span lang="en" class="latin-transliteration">' + line + '</span>' : line).join('<br>');
    }
    const content = {};
    ORDER.forEach(name => {
        const rows = M.strings['string_' + name + '_1.csv'];
        const groups = [];
        let current = null;
        rows.forEach(([id, text]) => {
            if (id.endsWith('_keyword')) {
                current = { title: text, body: [] };
                groups.push(current);
            } else if (current) {
                current.body.push(text);
            }
        });
        content[name] = { rows, groups };
    });
    const profileStrings = content.profile.rows.map(row => row[1]);
    const media = new Map(M.media.map(item => [item.page + '|' + item.keyword, item.paths]));
    const state = {
        index: 0,
        busy: false,
        target: null,
        queued: null,
        textAnimations: new Map(),
        wheelPose: 0,
        wheelRAF: 0,
        hoverBlocked: false,
        pointerX: 0,
        pointerY: 0,
        hoverX: 0,
        hoverY: 0
    };
    const world = $('world-layer'), pageMap = new Map();
    function installWorldPages() {
        const worldRoot = $('world-pages');
        pageMap.set('profile', worldRoot.querySelector('[data-page="profile"]'));
        for (const name of ORDER.slice(1)) {
            const section = document.createElement('section');
            section.className = 'world-page report-page';
            section.dataset.page = name;
            section.innerHTML = '<div class="keyword-row"></div><div class="report-art"><div class="report-label">보고서</div><div class="report-copy"><div class="report-body" aria-live="polite"></div></div><div class="report-media"></div></div>';
            $('report-pages').appendChild(section);
            pageMap.set(name, section);
        }
        ORDER.forEach((name, i) => {
            const c = M.camera[i], section = pageMap.get(name);
            section.style.left = (c.x - VX / SCALE) + 'px';
            section.style.top = (c.y - VY / SCALE) + 'px';
            section.style.transform = 'scale(' + (1 / SCALE) + ')';
        });
    }
    function cornerButton(label) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'corner-button';
        b.innerHTML = ['tl', 'tr', 'bl', 'br'].map(c => '<span class="corner ' + c + '"></span>').join('') + '<span>' + escapeHTML(label) + '</span>';
        return b;
    }
    function tableHTML(table, id) {
        const widths = table.widths || [], total = widths.reduce((a, b) => a + b, 0);
        const cols = total ? '<colgroup>' + widths.map(n => '<col style="width:' + (n / total * 100).toFixed(5) + '%">').join('') + '</colgroup>' : '';
        return '<table data-table="' + escapeHTML(id) + '">' + cols + table.rows.map((r, i) => '<tr>' + r.map(v => '<' + (i ? 'td' : 'th') + '>' + rich(v) + '</' + (i ? 'td' : 'th') + '>').join('') + '</tr>').join('') + '</table>';
    }
    function reportAttachments(name, title) {
        let insert = null;
        let append = '';
        for (const [id, table] of Object.entries(M.tables)) {
            if (table.page !== name || table.keyword !== title)
                continue;
            const html = tableHTML(table, id);
            if (Number.isInteger(table.insertAfter)) {
                insert = { after: table.insertAfter, html };
            } else {
                append += html;
            }
        }
        for (const video of M.videos) {
            if (video.page !== name || video.keyword !== title)
                continue;
            const url = escapeHTML(video.video_url);
            append += '<p><a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a></p>';
        }
        return { append, insert };
    }
    function stopTextAnim(page) {
        const animation = state.textAnimations.get(page);
        if (animation) {
            animation.cancel();
        }
        state.textAnimations.delete(page);
        page.querySelector('.report-body').removeAttribute('aria-busy');
    }
    function writeText(page, body, animate, append = '', insert = null) {
        const area = page.querySelector('.report-body');
        stopTextAnim(page);
        const token = (Number(page.dataset.textToken) || 0) + 1;
        page.dataset.textToken = String(token);
        const draw = () => {
            const parts = (body.length ? body : [GUIDE]).map(text => '<p>' + rich(text) + '</p>');
            if (insert) {
                parts.splice(insert.after, 0, insert.html);
            }
            area.innerHTML = parts.join('') + append;
        };
        if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            draw();
            return;
        }
        area.setAttribute('aria-busy', 'true');
        const out = area.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-50px)', opacity: 0 }], { duration: 200, easing: 'ease-in-out', fill: 'forwards' });
        state.textAnimations.set(page, out);
        out.onfinish = () => {
            if (Number(page.dataset.textToken) !== token)
                return;
            draw();
            out.cancel();
            const incoming = area.animate([{ transform: 'translateY(50px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 200, easing: 'ease-in-out', fill: 'forwards' });
            state.textAnimations.set(page, incoming);
            incoming.onfinish = () => {
                if (Number(page.dataset.textToken) !== token) {
                    return;
                }
                incoming.cancel();
                state.textAnimations.delete(page);
                area.removeAttribute('aria-busy');
            };
        };
    }
    function showMedia(page, name, title) {
        const slots = page.querySelector('.report-media');
        slots.replaceChildren();
        const imgs = media.get(name + '|' + title) || [];
        page.classList.toggle('media-active', imgs.length > 0);
        imgs.slice(0, 2).forEach(path => { const box = document.createElement('div'), img = document.createElement('img'); box.className = 'media-slot'; img.src = path; img.alt = ''; img.loading = 'lazy'; box.appendChild(img); slots.appendChild(box); });
    }
    function chooseKeyword(page, index, clicked) {
        const name = page.dataset.page, group = content[name].groups[index];
        if (!group)
            return;
        if (!clicked && (state.busy || state.hoverBlocked))
            return;
        if (page.dataset.selected === String(index)) {
            return;
        }
        page.dataset.selected = String(index);
        page.querySelector('.report-label').textContent = '보고서 - ' + group.title;
        page.querySelectorAll('.keyword-row button').forEach((b, j) => b.classList.toggle('active', j === index));
        showMedia(page, name, group.title);
        const attachments = reportAttachments(name, group.title);
        writeText(page, group.body, clicked, attachments.append, attachments.insert);
    }
    function initReports() {
        for (const name of ORDER.slice(1)) {
            const page = pageMap.get(name), row = page.querySelector('.keyword-row');
            for (const [i, group] of content[name].groups.entries()) {
                const b = cornerButton(group.title);
                b.addEventListener('mouseenter', () => chooseKeyword(page, i, false));
                b.addEventListener('click', () => chooseKeyword(page, i, true));
                row.appendChild(b);
            }
            resetReport(page);
        }
    }
    function resetReport(page) {
        delete page.dataset.selected;
        page.querySelector('.report-label').textContent = '보고서';
        page.querySelectorAll('.keyword-row button').forEach(b => b.classList.remove('active'));
        page.querySelector('.report-media').replaceChildren();
        page.classList.remove('media-active');
        writeText(page, [GUIDE], false);
    }
    function renderProfileTools() {
        const root = $('profile-tool-bars');
        root.replaceChildren();
        const byId = new Map(M.strings['string_profile_1.csv']);
        for (const tool of M.profileTools) {
            const row = document.createElement('div');
            row.className = 'profile-skill';
            row.dataset.panel = String(tool.panel);
            row.dataset.slot = String(tool.order);
            const icon = document.createElement('img');
            icon.className = 'profile-skill-icon';
            icon.src = tool.icon;
            icon.alt = '';
            icon.setAttribute('aria-hidden', 'true');
            const meter = document.createElement('div');
            meter.className = 'profile-skill-meter';
            meter.tabIndex = 0;
            meter.setAttribute('role', 'meter');
            meter.setAttribute('aria-label', tool.tool);
            meter.setAttribute('aria-valuemin', '0');
            meter.setAttribute('aria-valuemax', String(tool.maximum));
            meter.setAttribute('aria-valuenow', String(tool.score));
            const fill = document.createElement('span');
            fill.className = 'profile-skill-fill';
            fill.style.width = (100 * tool.score / tool.maximum) + '%';
            const numbers = document.createElement('span');
            numbers.className = 'profile-skill-value';
            numbers.textContent = tool.score + ' / ' + tool.maximum;
            const tip = document.createElement('span');
            tip.className = 'profile-skill-tooltip';
            const tipText = byId.get(String(tool.tooltip_id));
            if (!tipText)
                throw Error('Missing profile tool tooltip ID ' + tool.tooltip_id);
            if (tool.url) {
                const link = document.createElement('a');
                link.textContent = tipText;
                link.href = tool.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                tip.appendChild(link);
            }
            else {
                tip.textContent = tipText;
            }
            tip.setAttribute('role', 'tooltip');
            meter.append(fill, numbers, tip);
            row.append(icon, meter);
            root.appendChild(row);
        }
    }
    function renderProfile() {
        const q = profileStrings[2].split(/<br\s*\/?\s*>/i);
        $('hero-first').textContent = profileStrings[0];
        $('hero-second').textContent = profileStrings[1];
        $('quote-profile').innerHTML = '<div>' + rich(q[0]) + '</div><div>' + rich(q[1] || '') + '</div><div class="credit">' + rich(q.slice(2).join('<br>')) + '</div>';
        const fields = [['이름', profileStrings[3]], ['생년월일', profileStrings[4]], ['학교', profileStrings[5] + ' · ' + profileStrings[6]], ['학점', profileStrings[7]], ['Tel', profileStrings[8].replace(/^Tel\s*:\s*/, '')], ['Email', profileStrings[9].replace(/^Email\s*:\s*/, '')]];
        $('identity-cells').innerHTML = fields.map(([k, v]) => '<div class="row"><span class="key">' + escapeHTML(k) + '</span><span class="value">' + rich(v) + '</span></div>').join('');
        $('profile-image-caption').textContent = profileStrings[10];
    }
    function refreshCommon(index) {
        $('scroll-guide').hidden = index !== 0;
        $('page-num').textContent = CODES[index];
        $('frame').dataset.page = ORDER[index];
        document.querySelectorAll('.top-nav button').forEach(b => b.classList.toggle('active', ORDER[index] === b.dataset.target));
        document.querySelectorAll('#arsenal-items button').forEach(b => b.classList.toggle('active', Number(b.dataset.page) === index));
    }
    function activatePage(index) {
        state.index = index;
        ORDER.forEach((name, j) => {
            const page = pageMap.get(name);
            page.dataset.active = String(j === index);
            delete page.dataset.inTransit;
            if (j === index && name !== 'profile') {
                resetReport(page);
            }
        });
        state.hoverBlocked = true;
        state.hoverX = state.pointerX;
        state.hoverY = state.pointerY;
        refreshCommon(index);
    }
    function focusPoint(center, zoom) { return `translate3d(${VX - center.x * SCALE * zoom}px,${VY - center.y * SCALE * zoom}px,0) scale(${SCALE * zoom})`; }
    function focus(index, zoom = 1) { return focusPoint(M.camera[index], zoom); }
    function centerBetween(i, j) { return { x: (M.camera[i].x + M.camera[j].x) / 2, y: (M.camera[i].y + M.camera[j].y) / 2 }; }
    function stopZoom(i, j) {
        const dist = Math.hypot(M.camera[i].x - M.camera[j].x, M.camera[i].y - M.camera[j].y) * SCALE;
        return Math.max(.18, Math.min(.84, 1400 / (1400 + dist)));
    }
    function steer(direction, duration) {
        const el = $('helm-wheel'), pose = state.wheelPose;
        if (state.wheelRAF)
            cancelAnimationFrame(state.wheelRAF);
        const start = performance.now(), row = direction > 0 ? 1 : 2;
        function tick(now) {
            const t = Math.min(1, (now - start) / duration), f = Math.min(15, Math.floor(t * 16));
            el.style.backgroundPosition = (-88 * f) + 'px ' + (-88 * row) + 'px';
            el.style.transform = 'rotate(' + pose + 'deg)';
            if (t < 1) {
                state.wheelRAF = requestAnimationFrame(tick);
            }
            else {
                state.wheelPose = pose + (direction > 0 ? 334 : -334);
                el.style.transform = 'rotate(' + state.wheelPose + 'deg)';
                el.style.backgroundPosition = '0 0';
                state.wheelRAF = 0;
            }
        }
        state.wheelRAF = requestAnimationFrame(tick);
    }
    function hillProgress(t) { return t - Math.sin(4 * Math.PI * t) / (4 * Math.PI); }
    function zoomProgress(t, min) { const u = t < .5 ? 2 * t : 2 * t - 1; const half = (1 - Math.cos(Math.PI * u)) / 2; return t < .5 ? 1 - (1 - min) * half : min + (1 - min) * half; }
    function navigate(next) {
        if (next < 0 || next >= ORDER.length)
            return;
        if (state.busy) {
            state.queued = next;
            return;
        }
        if (next === state.index)
            return;
        const from = state.index, min = stopZoom(from, next), duration = M.transitionMs;
        state.busy = true;
        state.target = next;
        const targetPage = pageMap.get(ORDER[next]);
        targetPage.dataset.inTransit = 'true';
        if (ORDER[next] !== 'profile')
            resetReport(targetPage);
        const start = performance.now(), origin = M.camera[from], destination = M.camera[next];
        let midpointSwapped = false;
        steer(next > from ? 1 : -1, duration);
        function tick(now) {
            const t = Math.min(1, (now - start) / duration), progress = hillProgress(t), zoom = zoomProgress(t, min);
            const c = { x: origin.x + (destination.x - origin.x) * progress, y: origin.y + (destination.y - origin.y) * progress };
            world.style.transform = focusPoint(c, zoom);
            if (t >= .5 && !midpointSwapped) {
                midpointSwapped = true;
                activatePage(next);
            }
            if (t < 1) {
                requestAnimationFrame(tick);
                return;
            }
            world.style.transform = focus(next);
            state.busy = false;
            state.target = null;
            const queued = state.queued;
            state.queued = null;
            if (queued !== null && queued !== state.index)
                navigate(queued);
        }
        requestAnimationFrame(tick);
    }
    function fit() { const scale = Math.min(innerWidth / 1905, innerHeight / 911); $('stage').style.transform = 'scale(' + scale + ')'; }
    function initNav() {
        const list = $('arsenal-items');
        for (const [label, i] of NAV) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.page = String(i);
            button.textContent = CODES[i] + ' - ' + label;
            button.addEventListener('click', () => navigate(i));
            list.appendChild(button);
        }
    }
    window.addEventListener('pointermove', e => {
        state.pointerX = e.clientX;
        state.pointerY = e.clientY;
        if (state.hoverBlocked && !state.busy && Math.hypot(e.clientX - state.hoverX, e.clientY - state.hoverY) > 3) {
            state.hoverBlocked = false;
            const button = e.target.closest?.('.world-page[data-active="true"] .keyword-row button');
            if (button) {
                const page = button.closest('.world-page');
                chooseKeyword(page, [...page.querySelectorAll('.keyword-row button')].indexOf(button), false);
            }
        }
    }, { passive: true });
    let lastWheel = 0;
    window.addEventListener('wheel', e => {
        e.preventDefault();
        if (Math.abs(e.deltaY) < 3)
            return;
        const now = performance.now();
        if (now - lastWheel < 125)
            return;
        lastWheel = now;
        const base = state.queued !== null ? state.queued : state.target !== null ? state.target : state.index;
        navigate(base + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
    window.addEventListener('keydown', e => {
        if (['ArrowDown', 'PageDown'].includes(e.key)) {
            e.preventDefault();
            navigate(state.index + 1);
        }
        else if (['ArrowUp', 'PageUp'].includes(e.key)) {
            e.preventDefault();
            navigate(state.index - 1);
        }
    });
    window.addEventListener('resize', fit);
    $('brand').addEventListener('click', () => navigate(0));
    document.querySelectorAll('.top-nav button').forEach(b => b.addEventListener('click', () => navigate(ORDER.indexOf(b.dataset.target))));
    $('starboard').addEventListener('click', () => window.open('https://youtu.be/mS9qQByGAWE?si=cqDjgb7t6tDbiFTW', '_blank', 'noopener,noreferrer'));
    installWorldPages();
    initReports();
    renderProfile();
    renderProfileTools();
    initNav();
    fit();
    world.style.transform = focus(0);
    activatePage(0);
})();
