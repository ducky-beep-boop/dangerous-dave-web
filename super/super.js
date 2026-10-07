/*
** super.js - what the page of Super Dangerous Dave adds to shell.js
**
** The level set, the twists and the level select (port/super/README.md).
** Runs after shell.js (which builds Module and its arguments) and before
** dave.js: the chosen set and twists go on the command line of the game
** (--levels, --twist), changes while it runs are told to it
** (dave_web_super_levelset, dave_web_super_twists in timeline.c) and
** take effect with the next game.  The settings are kept in localStorage
** under "dave:super"; ?levels=super|classic and ?twist=LIST in the
** address replace them for this visit and are not remembered.
*/

'use strict';

(function () {
	var query = new URLSearchParams(location.search);
	var setSelect = document.getElementById('levelset');
	var twistBoxes = document.querySelectorAll('#twists input[data-twist]');
	var startSelect = document.getElementById('startlevel');
	var startButton = document.getElementById('start');
	var canvas = document.getElementById('canvas');
	var SETS = ['super', 'classic'];
	var TWISTS = { immune: 1, ghost: 2, timer: 4 };
	var ALL = 7;

	/* ---- settings ---- */

	var settings = { levels: 'super', twists: {} };	/* twists: name -> bool, if ever touched */

	try {
		var saved = JSON.parse(localStorage.getItem('dave:super'));
		if (saved && typeof saved === 'object') {
			if (SETS.indexOf(saved.levels) >= 0)
				settings.levels = saved.levels;
			if (saved.twists && typeof saved.twists === 'object')
				for (var name in TWISTS)
					if (typeof saved.twists[name] === 'boolean')
						settings.twists[name] = saved.twists[name];
		}
	} catch (e) {}

	function save() {
		try {
			localStorage.setItem('dave:super', JSON.stringify(settings));
		} catch (e) {}
	}

	/* the set's defaults: all for super, ghost and timer for classic */
	function defaultOn(name, levels) {
		return name !== 'immune' || levels === 'super';
	}

	function twistOn(name) {
		return typeof settings.twists[name] === 'boolean'
			? settings.twists[name] : defaultOn(name, settings.levels);
	}

	function twistMask() {
		var mask = 0;
		for (var name in TWISTS)
			if (twistOn(name))
				mask |= TWISTS[name];
		return mask;
	}

	function twistList(mask) {
		var names = [];
		for (var name in TWISTS)
			if (mask & TWISTS[name])
				names.push(name);
		return names.join(',') || 'none';
	}

	/* ---- the address overrides this visit ---- */

	var levelsQuery = query.get('levels');
	var twistQuery = query.get('twist');
	var levels = SETS.indexOf(levelsQuery) >= 0 ? levelsQuery : settings.levels;
	var twists = twistMask();

	if (levelsQuery !== null && SETS.indexOf(levelsQuery) >= 0 && twistQuery === null) {
		twists = 0;	/* the set of the address, with its defaults */
		for (var tn in TWISTS)
			if (typeof settings.twists[tn] === 'boolean' ? settings.twists[tn]
				: defaultOn(tn, levels))
				twists |= TWISTS[tn];
	}
	if (twistQuery !== null) {
		twists = 0;
		twistQuery.split(',').forEach(function (name) {
			if (name === 'all')
				twists = ALL;
			else if (TWISTS[name])
				twists |= TWISTS[name];
		});
	}

	/* ---- the controls ---- */

	function call(name, a, b) {
		if (window.Module && typeof Module['_' + name] === 'function'
			&& window.daveSuperRunning)
			return Module['_' + name](a, b);
	}

	function showControls() {
		setSelect.value = levels;
		Array.prototype.forEach.call(twistBoxes, function (box) {
			box.checked = (twists & TWISTS[box.getAttribute('data-twist')]) !== 0;
		});
	}

	setSelect.addEventListener('change', function () {
		levels = setSelect.value;
		settings.levels = levels;
		/* the twists a player has not touched follow the set */
		twists = 0;
		for (var name in TWISTS)
			if (twistOn(name))
				twists |= TWISTS[name];
		save();
		call('dave_web_super_levelset', SETS.indexOf(levels));
		call('dave_web_super_twists', twists);
		showControls();
		canvas.focus();
	});

	Array.prototype.forEach.call(twistBoxes, function (box) {
		var name = box.getAttribute('data-twist');

		box.addEventListener('change', function () {
			twists = box.checked ? twists | TWISTS[name] : twists & ~TWISTS[name];
			settings.twists[name] = box.checked;
			save();
			call('dave_web_super_twists', twists);
			canvas.focus();
		});
	});

	/* the level select: the digit key, which the title screen, the high
	   scores and a demo take as "start at that level" (scan codes 2-11:
	   1 ... 9, 0 for level 10) */
	startButton.addEventListener('click', function () {
		var n = Number(startSelect.value);
		var scancode = n === 10 ? 11 : n + 1;

		call('dave_web_key', scancode, 1);
		setTimeout(function () { call('dave_web_key', scancode, 0); }, 60);
		canvas.focus();
	});

	/* ---- the game's command line ---- */

	if (window.Module && Module.arguments) {
		Module.arguments.push('--levels', levels, '--twist', twistList(twists));
		var started = Module.onRuntimeInitialized;
		Module.onRuntimeInitialized = function () {
			window.daveSuperRunning = true;
			if (started)
				started();
		};
		var quit = Module.onDaveQuit;
		Module.onDaveQuit = function (code) {
			window.daveSuperRunning = false;
			if (quit)
				quit(code);
		};
	}

	showControls();
}());
