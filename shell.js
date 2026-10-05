/*
** shell.js - the page around the game (port/web)
**
** Sets up Module for dave.js (the program emcc makes of the game and
** port/platform/backend_sdl.c), sizes the canvas, and connects the
** controls of the page with the functions the backend exports
** (dave_web_...).
**
** For testing, the address takes what davehl takes on its command line:
**
**	?keys=SCRIPT	scripted keys, e.g. ?keys=200:enter,260:right*60
**	&frames=N	stand still after N frames
**	&seed=N		the "time" that picks the demos (davehl: 0)
**	&turbo=1	do not wait for the clock (and no sound)
**	&touch=1	show the touch buttons
**	&cheat=LIST	modifiers: gun,exit,lives,jetpack (or all, none),
**			instead of the remembered checkboxes; LIST@FRAME
**			sets them when that frame is shown
*/

'use strict';

(function () {
	var canvas = document.getElementById('canvas');
	var stage = document.getElementById('stage');
	var overlay = document.getElementById('overlay');
	var touch = document.getElementById('touch');
	var muteButton = document.getElementById('mute');
	var volumeSlider = document.getElementById('volume');
	var aspectButton = document.getElementById('aspect');
	var fullscreenButton = document.getElementById('fullscreen');
	var query = new URLSearchParams(location.search);

	var running = false;	/* the game has started */
	var over = false;	/* the game has quit, or broke */

	/* ---- settings, kept between visits ---- */

	var settings = { volume: 50, mute: false, aspect: true, cheats: 0 };

	try {
		var saved = JSON.parse(localStorage.getItem('dave:settings'));
		if (saved && typeof saved === 'object') {
			if (typeof saved.volume === 'number')
				settings.volume = Math.max(0, Math.min(100, Math.round(saved.volume)));
			settings.mute = !!saved.mute;
			settings.aspect = saved.aspect !== false;
			if (typeof saved.cheats === 'number')
				settings.cheats = saved.cheats & 15;
		}
	} catch (e) {}

	function saveSettings() {
		var kept = { volume: settings.volume, mute: settings.mute,
			aspect: settings.aspect };

		if (settings.cheats)		/* modifiers only if there are any */
			kept.cheats = settings.cheats;
		try {
			localStorage.setItem('dave:settings', JSON.stringify(kept));
		} catch (e) {}
	}

	/* calls a function of the backend, if the game is there */
	function call(name, a, b) {
		if (running && !over && typeof Module['_' + name] === 'function')
			return Module['_' + name](a, b);
	}

	/* ---- the size of the canvas ---- */

	/*
	** The picture is 320 * 200 pixels shown 4:3 (or 8:5 with square
	** pixels).  In a window it gets the largest whole number of
	** screen pixels per game pixel across that fits, so that all
	** columns are equally wide.  In full screen, on a touch screen
	** and where not even one fits, it gets all the room there is.
	*/
	function layout() {
		var roomW = stage.clientWidth;
		var roomH = stage.clientHeight - (touch.hidden ? 0 : touch.offsetHeight);
		var shapeH = settings.aspect ? 240 : 200;
		var ratio = window.devicePixelRatio || 1;
		var scale = Math.min(roomW / 320, roomH / shapeH);
		var whole = Math.floor(scale * ratio) / ratio;

		if (whole * ratio >= 1 && !document.fullscreenElement && touch.hidden)
			scale = whole;
		if (!(scale > 0))
			scale = 1;
		canvas.style.width = 320 * scale + 'px';
		canvas.style.height = shapeH * scale + 'px';
	}

	window.addEventListener('resize', layout);
	document.addEventListener('fullscreenchange', layout);

	/* ---- the overlay: loading, click to play, game over ---- */

	function show(text) {
		overlay.textContent = text;
		overlay.hidden = false;
	}

	function updateOverlay() {
		if (over || !running)
			return;
		if (document.activeElement === canvas)
			overlay.hidden = true;
		else
			show('Click here to play');
	}

	overlay.addEventListener('click', function () {
		if (over)
			location.reload();
		else
			canvas.focus();
	});

	canvas.addEventListener('focus', updateOverlay);
	canvas.addEventListener('blur', function () {
		call('dave_web_blur');		/* no key stays down */
		updateOverlay();
	});

	function broke(what) {
		if (over)
			return;
		over = true;
		show('The game stopped: ' + what + ' - click to restart');
	}

	/* ---- sound ---- */

	/* browsers only let a page make sound once it has been touched */
	function wakeAudio() {
		var sdl = Module['SDL2'];
		if (sdl && sdl.audioContext && sdl.audioContext.state === 'suspended')
			sdl.audioContext.resume();
	}

	window.addEventListener('keydown', wakeAudio, true);
	window.addEventListener('pointerdown', wakeAudio, true);

	function showSound() {
		muteButton.textContent = settings.mute ? 'Sound off' : 'Sound on';
		muteButton.setAttribute('aria-pressed', String(!settings.mute));
		volumeSlider.value = settings.volume;
	}

	muteButton.addEventListener('click', function () {
		settings.mute = !settings.mute;
		call('dave_web_mute', settings.mute ? 1 : 0);
		showSound();
		saveSettings();
		canvas.focus();
	});

	volumeSlider.addEventListener('input', function () {
		settings.volume = Number(volumeSlider.value);
		call('dave_web_volume', settings.volume);
		saveSettings();
	});
	volumeSlider.addEventListener('change', function () { canvas.focus(); });

	/* ---- picture ---- */

	function showAspect() {
		aspectButton.textContent = settings.aspect ? '4:3' : 'Square pixels';
		aspectButton.setAttribute('aria-pressed', String(settings.aspect));
	}

	aspectButton.addEventListener('click', function () {
		settings.aspect = !settings.aspect;
		showAspect();
		layout();
		saveSettings();
		canvas.focus();
	});

	fullscreenButton.addEventListener('click', function () {
		if (document.fullscreenElement)
			document.exitFullscreen();
		else if (stage.requestFullscreen)
			stage.requestFullscreen().then(function () {
				/* where it can be had, Esc is the game's in
				   full screen (holding it leaves) */
				if (navigator.keyboard && navigator.keyboard.lock)
					navigator.keyboard.lock(['Escape']).catch(function () {});
			}).catch(function () {});
		canvas.focus();
	});
	if (!stage.requestFullscreen)
		fullscreenButton.hidden = true;

	/* ---- modifiers of the game's rules ---- */

	/*
	** Four checkboxes, each one bit of the set the backend takes
	** (DAVE_CHEAT_... in port/platform/backend.h).  The game starts
	** with the remembered set (--cheat) and is told of every change
	** (dave_web_cheats); it acts on it with its next frame.  ?cheat=
	** in the address replaces the remembered set for this visit and
	** is not remembered itself.
	*/
	var cheatBoxes = document.querySelectorAll('#modifiers input');
	var cheats = settings.cheats;
	var cheatQuery = query.get('cheat');

	function cheatNames(mask) {
		var names = [];
		Array.prototype.forEach.call(cheatBoxes, function (box) {
			if (mask & Number(box.getAttribute('data-cheat')))
				names.push(box.getAttribute('data-name'));
		});
		return names.join(',') || 'none';
	}

	if (cheatQuery !== null) {
		cheats = 0;
		if (cheatQuery.indexOf('@') < 0)
			cheatQuery.split(',').forEach(function (name) {
				Array.prototype.forEach.call(cheatBoxes, function (box) {
					if (name === 'all' || name === box.getAttribute('data-name'))
						cheats |= Number(box.getAttribute('data-cheat'));
				});
			});
	}

	Array.prototype.forEach.call(cheatBoxes, function (box) {
		var bit = Number(box.getAttribute('data-cheat'));

		box.checked = (cheats & bit) !== 0;
		box.addEventListener('change', function () {
			cheats = box.checked ? cheats | bit : cheats & ~bit;
			if (running)
				call('dave_web_cheats', cheats);
			else	/* not started yet: it starts with this set */
				args[cheatArg] = cheatNames(cheats);
			settings.cheats = cheats;
			saveSettings();
			canvas.focus();
		});
	});

	/* ---- keys ---- */

	/*
	** While the canvas has the focus the game gets every key and the
	** browser none (SDL sees to that).  These are let through to the
	** browser, which the game has no use for: reload, full screen,
	** developer tools, and everything with the Meta key.
	*/
	window.addEventListener('keydown', function (e) {
		if (e.key === 'F5' || e.key === 'F11' || e.key === 'F12' || e.metaKey
			|| (e.ctrlKey && (e.key === 'r' || e.key === 'R')))
			e.stopPropagation();
	}, true);

	/* ---- buttons for touch screens ---- */

	if (query.get('touch') === '1'
		|| (window.matchMedia && matchMedia('(pointer: coarse)').matches))
	{
		touch.hidden = false;
		document.body.classList.add('touch');	/* no key legend */
	}

	Array.prototype.forEach.call(touch.querySelectorAll('button'), function (button) {
		var keys = button.getAttribute('data-keys').split(' ').map(Number);

		function set(down) {
			if (button.classList.contains('down') === down)
				return;
			button.classList.toggle('down', down);
			keys.forEach(function (key) { call('dave_web_key', key, down ? 1 : 0); });
		}

		button.addEventListener('pointerdown', function (e) {
			e.preventDefault();
			/* the finger may slide off the button and still hold it */
			try { button.setPointerCapture(e.pointerId); } catch (err) {}
			set(true);
		});
		['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
			button.addEventListener(type, function () { set(false); });
		});
		button.addEventListener('contextmenu', function (e) { e.preventDefault(); });
	});

	/* ---- the game ---- */

	var args = ['--volume', String(settings.volume)];

	if (settings.mute)
		args.push('--mute');
	if (query.get('keys'))
		args.push('--keys', query.get('keys'));
	if (query.get('frames'))
		args.push('--frames', query.get('frames'));
	if (query.get('seed'))
		args.push('--seed', query.get('seed'));
	if (query.get('turbo') === '1')
		args.push('--turbo');
	args.push('--cheat', cheatQuery !== null ? cheatQuery : cheatNames(cheats));
	var cheatArg = args.length - 1;

	window.Module = {
		canvas: canvas,
		arguments: args,
		print: function (text) { console.log(text); },
		printErr: function (text) { console.error(text); },
		onRuntimeInitialized: function () {
			running = true;
			canvas.focus();
			updateOverlay();
		},
		/* be_quit: the player left the game */
		onDaveQuit: function () {
			over = true;
			show('Game ended - click to restart');
		},
		/* ?frames=N has been reached; tests wait for this */
		onDaveFrames: function (frames) {
			window.daveFramesDone = frames;
		},
		onAbort: function (what) { broke(String(what)); }
	};

	window.addEventListener('error', function (e) {
		/* a script of the page failed, or dave.js / dave.wasm is missing */
		if (!running || (e.filename && /dave\.js/.test(e.filename)))
			broke(e.message || 'could not be loaded');
	}, true);

	showSound();
	showAspect();
	layout();
}());
