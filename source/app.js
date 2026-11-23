(async () => {
    'use strict';
    // GitHub Pages reads deployed CSV directly; the locally built HTML uses Python's embedded manifest.
    function parseCSV(csvText) {
        const input = String(csvText).replace(/^\uFEFF/, '');
        const rows = [];
        let row = [], cell = '', quoted = false;
        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            if (quoted) {
                if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
                else if (char === '"') quoted = false;
                else cell += char;
            } else if (char === '"') {
                if (cell !== '') throw Error('잘못된 CSV 인용부호');
                quoted = true;
            } else if (char === ',') {
                row.push(cell); cell = '';
            } else if (char === '\n') {
                row.push(cell); rows.push(row); row = []; cell = '';
            } else if (char !== '\r') {
                cell += char;
            }
        }
        if (quoted) throw Error('닫히지 않은 CSV 인용부호');
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        return rows.filter(fields => fields.some(value => value !== ''));
    }
    function csvObjects(text, expectedColumns, path) {
        const [columns, ...rows] = parseCSV(text);
        if (!columns || columns.join(',') !== expectedColumns.join(',')) {
            throw Error(`CSV 열이 잘못되었습니다: ${path}`);
        }
        return rows.map(fields => {
            if (fields.length !== columns.length) throw Error(`CSV 열 개수 오류: ${path}`);
            return Object.fromEntries(columns.map((name, i) => [name, fields[i]]));
        });
    }
    async function createCSVReader() {
        const root = new URL('.', document.baseURI);
        document.documentElement.dataset.csvSource = 'site';
        return async path => {
            const response = await fetch(new URL(path, root), { cache: 'no-cache' });
            if (!response.ok) throw Error(`CSV 요청 실패: ${path} (HTTP ${response.status})`);
            return response.text();
        };
    }
    async function loadManifest() {
        const read = await createCSVReader();
        const get = (path, columns) => read(path).then(text => csvObjects(text, columns, path));
        const [pagesRaw, visualRows, mediaRows, videoRows, toolRows] = await Promise.all([
            get('source/rules/pages.csv', ['page', 'page_number', 'order', 'ship_source_center_x', 'ship_source_center_y', 'ship_scale', 'world_anchor_type', 'guide_rect_x', 'guide_rect_y', 'guide_rect_width', 'guide_rect_height']),
            get('source/rules/visual.csv', ['rule', 'value']),
            get('source/rules/keyword_media.csv', ['page', 'keyword_id', 'left_image', 'right_image']),
            get('source/rules/keyword_videos.csv', ['page', 'keyword_id', 'left_video_id', 'right_video_id']),
            get('source/rules/profile_tools.csv', ['tool', 'panel', 'order', 'score', 'maximum', 'icon', 'tooltip_id', 'url'])
        ]);
        const pages = pagesRaw.sort((a, b) => Number(a.order) - Number(b.order));
        if (pages.some((page, index) => Number(page.order) !== index)) throw Error('pages.csv 페이지 순서 오류');
        const names = pages.map(page => page.page);
        const stringFiles = pages.map((page, index) => `string_${page.page}_${index + 1}.csv`);
        const allStringRows = await Promise.all(stringFiles.map(file => read(`source/strings/${file}`).then(text => {
            const [columns, ...rows] = parseCSV(text);
            if (!columns || columns.join(',') !== 'id,text') throw Error(`문자열 CSV 열 오류: ${file}`);
            const ids = new Set();
            for (const fields of rows) {
                if (fields.length !== 2 || !fields[0] || ids.has(fields[0])) throw Error(`문자열 CSV ID 오류: ${file}`);
                ids.add(fields[0]);
            }
            return rows;
        })));
        const strings = Object.fromEntries(stringFiles.map((file, i) => [file, allStringRows[i]]));
        const indexed = Object.fromEntries(names.map((name, i) => [name, new Map(allStringRows[i])]));
        const visual = Object.fromEntries(visualRows.map(row => [row.rule, row.value]));
        const tableFiles = [...new Set(allStringRows.flatMap(rows => rows.filter(([id]) => id.endsWith('_table')).map(([, value]) => value)))];
        const tableRows = await Promise.all(tableFiles.map(file => get(`source/rules/${file}`, ['table_id', 'rows_json', 'col_widths_px', 'insert_after_paragraph']).then(rows => {
            if (rows.length !== 1) throw Error(`표 데이터 오류: ${file}`);
            const item = rows[0];
            return [file, {
                id: item.table_id,
                page: file.match(/^table_([^_]+)_/)?.[1],
                rows: JSON.parse(item.rows_json),
                widths: item.col_widths_px.split('|').filter(Boolean).map(Number),
                insertAfter: item.insert_after_paragraph ? Number(item.insert_after_paragraph) : null
            }];
        })));
        const profileImages = mediaRows.filter(row => row.page === 'profile').flatMap(row => [row.left_image, row.right_image].filter(Boolean));
        const media = mediaRows.filter(row => row.page !== 'profile').map(row => ({page: row.page, keyword_id: row.keyword_id, paths: [row.left_image, row.right_image]}));
        const videos = videoRows.map(row => ({page: row.page, keyword_id: row.keyword_id, ids: [row.left_video_id, row.right_video_id]}));
        for (const entry of [...media, ...videos]) {
            const keywords = [...indexed[entry.page]].filter(([id]) => id.endsWith('_keyword')).map(([id]) => id);
            if (!keywords.includes(entry.keyword_id)) throw Error(`이미지 또는 영상의 키워드 연결 오류: ${entry.page}/${entry.keyword_id}`);
        }
        return {
            pages: names,
            pageCodes: pages.map(page => page.page_number),
            camera: pages.map(page => ({x: Number(page.ship_source_center_x), y: Number(page.ship_source_center_y)})),
            cameraScale: Number(visual.ship_scale),
            stringFiles,
            strings,
            media, videos,
            tables: Object.fromEntries(tableRows),
            transitionMs: Number(visual.camera_transition_ms),
            profileImages,
            profileTools: toolRows.map(row => ({
                tool: row.tool, panel: Number(row.panel), order: Number(row.order), score: Number(row.score),
                maximum: Number(row.maximum), icon: row.icon, tooltip_id: row.tooltip_id, url: row.url
            }))
        };
    }
    const M = location.protocol === 'file:'
        ? JSON.parse(document.getElementById('portfolio-data').textContent)
        : await loadManifest();
    if (location.protocol === 'file:') document.documentElement.dataset.csvSource = 'built';
    const $ = id => document.getElementById(id);
    const ORDER = M.pages, CODES = M.pageCodes, SCALE = M.cameraScale || 9.2, VX = 952.5, VY = 455.5;
    const pageStrings = Object.fromEntries(ORDER.map((name, i) => [name, M.strings[M.stringFiles[i]]]));
    const profileById = new Map(pageStrings.profile);
    const getText = (page, id) => {
        const value = (page === 'profile' ? profileById : new Map(pageStrings[page])).get(id);
        if (value === undefined) throw Error(`Missing string ID ${page}/${id}`);
        return value;
    };
    const UI = {
        brand: getText('profile', '1023'),
        nav_profile: getText('profile', '1024'),
        nav_rts: getText('profile', '1025'),
        arsenal: getText('profile', '1026'),
        profile_heading: getText('profile', '1027'),
        profile_name: getText('profile', '1028'),
        profile_birthday: getText('profile', '1029'),
        profile_school: getText('profile', '1030'),
        profile_grades: getText('profile', '1031'),
        profile_phone: getText('profile', '1032'),
        profile_email: getText('profile', '1033'),
        panel_1: getText('profile', '1034'),
        panel_2: getText('profile', '1035'),
        panel_3: getText('profile', '1036'),
        panel_4: getText('profile', '1037'),
        profile_tools_aria: getText('profile', '1038'),
        top_nav_aria: getText('profile', '1039'),
        scroll_aria: getText('profile', '1040'),
        scroll_guide: getText('profile', '1041'),
        starboard: getText('profile', '1042'),
        report_title: getText('profile', '1043'),
        report_prefix: getText('profile', '1044'),
        guide: getText('profile', '1045'),
        lightbox_open: getText('profile', '1046'),
        lightbox_close: getText('profile', '1047'),
        lightbox_previous: getText('profile', '1048'),
        lightbox_next: getText('profile', '1049'),
        document_title: getText('profile', '1050'),
        lightbox_close_symbol: getText('profile', '1051'),
        lightbox_prev_symbol: getText('profile', '1052'),
        lightbox_next_symbol: getText('profile', '1053'),
        school_join: getText('profile', '1054'),
        number_join: getText('profile', '1055'),
        nav_join: getText('profile', '1056'),
        nav_marker: getText('profile', '1057')
    };
    const GUIDE = UI.guide;
    const pageTitles = Object.fromEntries(ORDER.slice(1).map(name => [name, pageStrings[name].find(([id]) => id.endsWith('_title'))[1]]));
    const NAV = [[UI.nav_profile, 0], [pageTitles.intro, 1], [pageTitles.develop, 2], [pageTitles.play, 3], [pageTitles.observe, 4], [UI.nav_rts, 5], [pageTitles.documents, 7], [pageTitles.history, 8]];
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
        const rows = pageStrings[name];
        const groups = [];
        let current = null;
        rows.forEach(([id, text]) => {
            if (id.endsWith('_keyword')) {
                current = { id, title: text, reportTitle: text, body: [], table: null };
                groups.push(current);
            } else if (id.endsWith('_report_title')) {
                if (!current || id !== current.id.replace('_keyword', '_report_title')) {
                    throw Error(`Invalid report title key ${name}/${id}`);
                }
                current.reportTitle = text;
            } else if (current && id.endsWith('_table')) {
                current.table = text;
            } else if (current && !id.endsWith('_title')) {
                current.body.push(text);
            }
        });
        content[name] = { rows, groups };
    });
    const profileStrings = profileById;
    const media = new Map(M.media.map(item => [item.page + '|' + item.keyword_id, item.paths]));
    const videos = new Map(M.videos.map(item => [item.page + '|' + item.keyword_id, item.ids]));
    const imageSource = path => location.protocol === 'file:'
        ? (M.embeddedImages?.[path] || path)
        : path;
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
            section.setAttribute('aria-label', pageTitles[name]);
            section.innerHTML = '<div class="keyword-row"></div><div class="report-art"><div class="report-label"></div><div class="report-copy"><div class="report-body" aria-live="polite"></div></div><div class="report-media"></div></div>';
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
        b.innerHTML = ['tl', 'tr', 'bl', 'br'].map(c => '<span class="corner ' + c + '"></span>').join('') + '<span>' + rich(label) + '</span>';
        return b;
    }
    function tableHTML(table, id) {
        const widths = table.widths || [], total = widths.reduce((a, b) => a + b, 0);
        const cols = total ? '<colgroup>' + widths.map(n => '<col style="width:' + (n / total * 100).toFixed(5) + '%">').join('') + '</colgroup>' : '';
        return '<table data-table="' + escapeHTML(id) + '">' + cols + table.rows.map((r, i) => '<tr>' + r.map(v => '<' + (i ? 'td' : 'th') + '>' + rich(v) + '</' + (i ? 'td' : 'th') + '>').join('') + '</tr>').join('') + '</table>';
    }
    function reportAttachments(name, group) {
        let insert = null;
        let append = '';
        if (group.table) {
            const table = M.tables[group.table];
            if (!table || table.page !== name) throw Error(`Missing table ${name}/${group.table}`);
            const html = tableHTML(table, table.id);
            if (Number.isInteger(table.insertAfter)) {
                insert = { after: table.insertAfter, html };
            } else {
                append += html;
            }
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
    function showMedia(page, name, keywordId) {
        const slots = page.querySelector('.report-media');
        slots.replaceChildren();
        const key = name + '|' + keywordId;
        const clips = videos.get(key) || [];
        const imgs = media.get(key) || [];
        page.classList.toggle('media-active', clips.length > 0 || imgs.some(Boolean));
        if (clips.length) {
            clips.forEach((id, index) => {
                const box = document.createElement('div');
                const frame = document.createElement('iframe');
                box.className = 'media-slot video-slot';
                box.style.gridColumn = String(index + 1);
                frame.src = 'https://www.youtube.com/embed/' + id + '?autoplay=0';
                frame.title = (index === 0 ? '왼쪽' : '오른쪽') + ' 프로젝트 테스트 영상';
                frame.loading = 'lazy';
                frame.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
                frame.allowFullscreen = true;
                frame.referrerPolicy = 'strict-origin-when-cross-origin';
                box.appendChild(frame);
                slots.appendChild(box);
            });
            return;
        }
        imgs.slice(0, 2).forEach((path, index) => {
            if (!path) return;
            const box = document.createElement('div'), img = document.createElement('img');
            box.className = 'media-slot';
            box.style.gridColumn = String(index + 1);
            img.alt = '';
            img.loading = 'lazy';
            // A failed image must not move another image or affect a newer keyword.
            img.addEventListener('error', () => {
                if (box.parentNode !== slots) return;
                box.remove();
                page.classList.toggle('media-active', slots.children.length > 0);
            }, { once: true });
            makeImageZoomable(img);
            box.appendChild(img);
            slots.appendChild(box);
            img.src = imageSource(path);
        });
    }
    function makeImageZoomable(image) {
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute('aria-label', UI.lightbox_open);
    }
    function setupImageViewer() {
        const root = document.createElement('div');
        root.id = 'image-viewer';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', UI.lightbox_open);
        root.innerHTML = '<div class="image-viewer-backdrop"></div><div class="image-viewer-photo"><img alt=""></div><button type="button" class="image-viewer-close image-viewer-control"></button><button type="button" class="image-viewer-prev image-viewer-arrow image-viewer-control"></button><button type="button" class="image-viewer-next image-viewer-arrow image-viewer-control"></button><div class="image-viewer-count image-viewer-control" aria-live="polite"></div>';
        document.body.appendChild(root);
        const backdrop = root.querySelector('.image-viewer-backdrop');
        const frame = root.querySelector('.image-viewer-photo');
        const picture = frame.querySelector('img');
        const counter = root.querySelector('.image-viewer-count');
        const closeButton = root.querySelector('.image-viewer-close');
        const prevButton = root.querySelector('.image-viewer-prev');
        const nextButton = root.querySelector('.image-viewer-next');
        for (const [button, label, symbol] of [[closeButton, UI.lightbox_close, UI.lightbox_close_symbol], [prevButton, UI.lightbox_previous, UI.lightbox_prev_symbol], [nextButton, UI.lightbox_next, UI.lightbox_next_symbol]]) {
            button.setAttribute('aria-label', label);
            button.textContent = symbol;
        }
        let gallery = [];
        let selected = 0;
        let origin = null;
        let phase = 'closed';
        let motion = null;
        let fade = null;
        const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
        const rect = element => {
            const box = element.closest('.profile-slot, .media-slot') || element;
            const bounds = box.getBoundingClientRect();
            return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
        };
        const destination = element => {
            const ratio = element.naturalWidth / element.naturalHeight;
            const width = Math.min(innerWidth * .8, innerHeight * .74 * ratio);
            const height = width / ratio;
            return { left: (innerWidth - width) / 2, top: (innerHeight - height) / 2, width, height };
        };
        const geometry = box => {
            frame.style.left = box.left + 'px';
            frame.style.top = box.top + 'px';
            frame.style.width = box.width + 'px';
            frame.style.height = box.height + 'px';
            counter.style.top = Math.min(innerHeight - 32, box.top + box.height + 16) + 'px';
        };
        const keyframe = box => ({ left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
        const animateBox = (from, to, duration, easing, done) => {
            geometry(from);
            motion = frame.animate([keyframe(from), keyframe(to)], { duration, easing, fill: 'forwards' });
            motion.onfinish = () => {
                geometry(to);
                motion.cancel();
                motion = null;
                done();
            };
        };
        const fadeBackdrop = (from, to, duration, easing) => {
            fade = backdrop.animate([{ opacity: from }, { opacity: to }], { duration, easing, fill: 'forwards' });
            fade.onfinish = () => {
                fade.cancel();
                fade = null;
            };
        };
        const updateSelection = () => {
            const chosen = gallery[selected];
            picture.src = chosen.currentSrc || chosen.src;
            counter.textContent = (selected + 1) + UI.number_join + gallery.length;
            prevButton.hidden = gallery.length < 2;
            nextButton.hidden = gallery.length < 2;
            return destination(chosen);
        };
        function openImage(image) {
            if (phase !== 'closed') return;
            const collection = image.closest('#profile-photos, .report-media');
            gallery = Array.from(collection.querySelectorAll('img'));
            selected = gallery.indexOf(image);
            origin = image;
            root.hidden = false;
            root.classList.remove('is-ready');
            closeButton.focus();
            phase = 'opening';
            const target = updateSelection();
            const start = rect(image);
            const duration = reducedMotion() ? 0 : 450;
            fadeBackdrop(0, 1, duration, 'ease-out');
            animateBox(start, target, duration, 'cubic-bezier(.22,1,.36,1)', () => {
                phase = 'open';
                closeButton.focus();
            });
            requestAnimationFrame(() => {
                if (phase === 'opening' || phase === 'open') root.classList.add('is-ready');
            });
        }
        function closeImage() {
            if (phase === 'closed' || phase === 'closing') return;
            const from = frame.getBoundingClientRect();
            if (motion) motion.cancel();
            const dimOpacity = Number(getComputedStyle(backdrop).opacity);
            if (fade) fade.cancel();
            motion = null;
            fade = null;
            root.classList.remove('is-ready');
            phase = 'closing';
            const duration = reducedMotion() ? 0 : 350;
            fadeBackdrop(dimOpacity, 0, duration, 'ease-in-out');
            animateBox({ left: from.left, top: from.top, width: from.width, height: from.height }, rect(origin), duration, 'ease-in-out', () => {
                root.hidden = true;
                picture.removeAttribute('src');
                phase = 'closed';
                origin.focus();
            });
        }
        function moveImage(delta) {
            if (phase !== 'open' || gallery.length < 2) return;
            selected = (selected + delta + gallery.length) % gallery.length;
            origin = gallery[selected];
            const from = frame.getBoundingClientRect();
            const target = updateSelection();
            animateBox({ left: from.left, top: from.top, width: from.width, height: from.height }, target, reducedMotion() ? 0 : 200, 'ease-in-out', () => {});
        }
        root.querySelector('.image-viewer-backdrop').addEventListener('click', closeImage);
        closeButton.addEventListener('click', closeImage);
        prevButton.addEventListener('click', () => moveImage(-1));
        nextButton.addEventListener('click', () => moveImage(1));
        root.addEventListener('keydown', event => {
            if (event.key === 'Tab') {
                const controls = gallery.length > 1 ? [closeButton, prevButton, nextButton] : [closeButton];
                const index = controls.indexOf(document.activeElement);
                controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus();
            }
            else if (event.key === 'Escape') closeImage();
            else if (event.key === 'ArrowLeft') moveImage(-1);
            else if (event.key === 'ArrowRight') moveImage(1);
            else return;
            event.preventDefault();
            event.stopPropagation();
        });
        window.addEventListener('resize', () => {
            if (phase === 'open') geometry(destination(gallery[selected]));
        });
        document.querySelectorAll('#profile-photos img').forEach(makeImageZoomable);
        const selector = '#profile-photos img, .report-media img';
        document.addEventListener('click', event => {
            const image = event.target.closest?.(selector) || (
                event.target.closest?.('.report-copy') && !event.target.closest('a, button')
                    ? document.elementsFromPoint(event.clientX, event.clientY).find(element => element.matches?.('.report-media img'))
                    : null
            );
            if (image) openImage(image);
        });
        document.addEventListener('keydown', event => {
            if ((event.key !== 'Enter' && event.key !== ' ') || !event.target.matches?.(selector)) return;
            event.preventDefault();
            openImage(event.target);
        });
        window.addEventListener('wheel', event => {
            if (root.hidden) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, { capture: true, passive: false });
        return { isOpen: () => !root.hidden };
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
        page.querySelector('.report-label').innerHTML = escapeHTML(UI.report_prefix) + rich(group.reportTitle);
        page.querySelectorAll('.keyword-row button').forEach((b, j) => b.classList.toggle('active', j === index));
        showMedia(page, name, group.id);
        const attachments = reportAttachments(name, group);
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
        page.querySelector('.report-label').textContent = UI.report_title;
        page.querySelectorAll('.keyword-row button').forEach(b => b.classList.remove('active'));
        page.querySelector('.report-media').replaceChildren();
        page.classList.remove('media-active');
        writeText(page, [GUIDE], false);
    }
    function renderProfileTools() {
        const root = $('profile-tool-bars');
        root.replaceChildren();
        const byId = profileStrings;
        for (const tool of M.profileTools) {
            const row = document.createElement('div');
            row.className = 'profile-skill';
            row.dataset.panel = String(tool.panel);
            row.dataset.slot = String(tool.order);
            const icon = document.createElement('img');
            icon.className = 'profile-skill-icon';
            icon.src = imageSource(tool.icon);
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
            numbers.textContent = tool.score + UI.number_join + tool.maximum;
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
        const profilePhotoElements = $('profile-photos').querySelectorAll('img');
        const profileImages = M.profileImages || Array.from(profilePhotoElements, img => img.getAttribute('src'));
        if (profileImages.length !== profilePhotoElements.length) throw Error('프로필 이미지 개수 불일치');
        profileImages.forEach((path, index) => { profilePhotoElements[index].src = imageSource(path); });
        document.title = getText('profile', '1050');
        document.querySelector('meta[name="description"]').content = getText('profile', '1001');
        const q = profileStrings.get('1003').split(/<br\s*\/?\s*>/i);
        $('hero-first').textContent = profileStrings.get('1001');
        $('hero-second').textContent = profileStrings.get('1002');
        $('quote-profile').innerHTML = '<div>' + rich(q[0]) + '</div><div>' + rich(q[1] || '') + '</div><div class="credit">' + rich(q.slice(2).join('<br>')) + '</div>';
        const fields = [[UI.profile_name, getText('profile','1004')], [UI.profile_birthday, getText('profile','1005')], [UI.profile_school, getText('profile','1006') + UI.school_join + getText('profile','1007')], [UI.profile_grades, getText('profile','1008')], [UI.profile_phone, getText('profile','1009')], [UI.profile_email, getText('profile','1010')]];
        $('identity-cells').innerHTML = fields.map(([k, v]) => '<div class="row"><span class="key">' + escapeHTML(k) + '</span><span class="value">' + rich(v) + '</span></div>').join('');
        $('profile-image-caption').textContent = profileStrings.get('1011');
        $('profile-tools-caption').textContent = profileStrings.get('1022');
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
        const currentMinimumZoom = Math.max(.18, Math.min(.84, 1400 / (1400 + dist)));
        return 1 - (1 - currentMinimumZoom) / 5;
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
            button.textContent = CODES[i] + UI.nav_join + label;
            button.dataset.activeMarker = UI.nav_marker;
            button.addEventListener('click', () => navigate(i));
            list.appendChild(button);
        }
    }
    function renderStaticLabels() {
        $('brand').textContent = UI.brand;
        $('identity').querySelector('h2').textContent = UI.profile_heading;
        document.querySelectorAll('.tool-title').forEach((title, i) => title.textContent = UI['panel_' + (i + 1)]);
        $('profile-tool-bars').setAttribute('aria-label', UI.profile_tools_aria);
        $('scroll-guide').setAttribute('aria-label', UI.scroll_aria);
        $('scroll-guide').querySelector('.scroll-guide-text').textContent = UI.scroll_guide;
        $('arsenal').setAttribute('aria-label', UI.arsenal);
        $('arsenal').querySelector('h2').textContent = UI.arsenal;
        $('starboard').lastElementChild.textContent = UI.starboard;
        document.querySelector('.top-nav').setAttribute('aria-label', UI.top_nav_aria);
        document.querySelectorAll('.top-nav button').forEach(button => button.textContent = pageTitles[button.dataset.target]);
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
        if (imageViewer.isOpen()) return;
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
    renderStaticLabels();
    installWorldPages();
    initReports();
    renderProfile();
    renderProfileTools();
    initNav();
    const imageViewer = setupImageViewer();
    fit();
    world.style.transform = focus(0);
    activatePage(0);
})().catch(error => {
    console.error('CSV 기반 포트폴리오 초기화 실패:', error);
    const message = document.createElement('div');
    message.className = 'csv-load-failure';
    message.setAttribute('role', 'alert');
    message.textContent = 'CSV 데이터 로딩 실패: ' + error.message;
    document.body.appendChild(message);
});
