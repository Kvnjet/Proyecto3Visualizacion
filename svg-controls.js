(function() {
  const state = {
    zoomEnabled: true,
    panEnabled: true,
    selectEnabled: true,
    callbacks: { zoom: null, pan: null, select: null }
  };

  const run = () => {
    const obj = document.querySelector('object[type="image/xml+svg"], object[type="image/svg+xml"]');
    if (!obj) return;

    let cleanup = null;

    const setup = () => {
      let svgDoc;
      try {
        svgDoc = obj.contentDocument;
      } catch (err) {
        console.error('CORS error: Cannot access contentDocument', err);
        return;
      }

      if (!svgDoc) return;
      const svg = svgDoc.documentElement;
      if (!svg || svg.tagName.toLowerCase() !== 'svg') return;

      let panning = false;
      let isDragging = false;
      let panStart = { x: 0, y: 0 };
      let clickStart = { x: 0, y: 0, time: 0 };
      let selected = null;
      // Flag to prevent onClick double-firing after onPointerUp already handled the click
      let didSelectOnPointerUp = false;

      if (!svg.getAttribute('viewBox')) {
        try {
          const b = svg.getBBox();
          if (b && b.width > 0 && b.height > 0) {
            svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
          } else {
            svg.setAttribute('viewBox', `0 0 ${svg.clientWidth || 100} ${svg.clientHeight || 100}`);
          }
        } catch (e) {
          svg.setAttribute('viewBox', `0 0 ${svg.clientWidth || 100} ${svg.clientHeight || 100}`);
        }
      }

      const vb = svg.viewBox.baseVal;
      const originalVB = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };

      const getSvgPoint = (clientX, clientY) => {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const inv = svg.getScreenCTM()?.inverse();
        return inv ? pt.matrixTransform(inv) : null;
      };

      const API = {
        setCallback: (type, fn) => {
          if (Object.prototype.hasOwnProperty.call(state.callbacks, type)) state.callbacks[type] = fn;
          else console.error('Invalid callback type');
        },
        toggleFeature: (feature, value) => {
          const key = feature + 'Enabled';
          if (Object.prototype.hasOwnProperty.call(state, key)) state[key] = !!value;
          else console.error('Invalid feature name');
        },
        // Visual highlighting is handled entirely by the host page via the select callback.
        // API.select only tracks which element is "current" and fires the callback.
        select: (id) => {
          if (!state.selectEnabled) return;
          selected = id ? svgDoc.getElementById(id) : null;
          if (state.callbacks.select) state.callbacks.select(selected);
        },
        zoom: (factor, clientX, clientY) => {
          if (!state.zoomEnabled) return;
          const rect = obj.getBoundingClientRect();
          const x = clientX || rect.left + rect.width / 2;
          const y = clientY || rect.top + rect.height / 2;
          const pt = getSvgPoint(x, y);
          if (!pt) return;

          vb.width *= factor;
          vb.height *= factor;
          vb.x = pt.x - (pt.x - vb.x) * factor;
          vb.y = pt.y - (pt.y - vb.y) * factor;
          if (state.callbacks.zoom) state.callbacks.zoom(factor);
        },
        pan: (dx, dy) => {
          if (!state.panEnabled) return;
          const scaleX = vb.width / obj.clientWidth;
          const scaleY = vb.height / obj.clientHeight;
          vb.x -= dx * scaleX;
          vb.y -= dy * scaleY;
          if (state.callbacks.pan) state.callbacks.pan(dx, dy);
        },
        reset: () => {
          vb.x = originalVB.x;
          vb.y = originalVB.y;
          vb.width = originalVB.w;
          vb.height = originalVB.h;
        },
        destroy: () => {
          if (cleanup) cleanup();
        }
      };

      const onWheel = (e) => {
        if (!state.zoomEnabled) return;
        e.preventDefault();
        const factor = Math.exp(e.deltaY * 0.0015);
        API.zoom(factor, e.clientX, e.clientY);
      };

      let clickTarget = null;
      const onPointerDown = (e) => {
        clickTarget = e.target;
        svg.setPointerCapture && svg.setPointerCapture(e.pointerId);
        if (e.button !== 0) return;
        panning = true;
        isDragging = false;
        panStart = { x: e.clientX, y: e.clientY };
        clickStart = { x: e.clientX, y: e.clientY, time: Date.now() };
        svg.style.cursor = 'grabbing';
        svg.setPointerCapture(e.pointerId);
      };

      // onClick handles all selection: it walks up the DOM to find the nearest element
      // with an id (handles clicks on child elements inside groups).
      // onPointerUp is only for drag detection — it does NOT call API.select to avoid
      // double-firing the select callback on the same click.
      const onClick = (e) => {
        if (didSelectOnPointerUp) {
          didSelectOnPointerUp = false;
          return;
        }
        if (isDragging) return;
        const el = clickTarget || e.target;
        let node = el;
        while (node && node !== svg && !node.id) node = node.parentNode;
        const targetId = node && node !== svg ? node.id : null;
        API.select(targetId);
        clickTarget = null;
      };

      const onPointerMove = (e) => {
        if (!panning) return;
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) isDragging = true;
        API.pan(dx, dy);
        panStart = { x: e.clientX, y: e.clientY };
      };

      const onPointerUp = (e) => {
        if (!panning) return;
        panning = false;
        svg.style.cursor = 'default';
        svg.releasePointerCapture(e.pointerId);

        const dist = Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y);
        const duration = Date.now() - clickStart.time;
        // Only handle direct hits (e.target has its own id) and only when not dragging.
        // onClick below handles DOM-walking for child elements.
        if (!isDragging && dist < 6 && duration < 500) {
          const targetId = e.target && e.target.id ? e.target.id : null;
          if (targetId) {
            API.select(targetId);
            didSelectOnPointerUp = true;
            // Reset flag after click event fires (which follows pointerup synchronously)
            setTimeout(() => { didSelectOnPointerUp = false; }, 0);
          }
          // If no direct targetId, let onClick handle it via DOM walking
        }
      };

      const onDblClick = () => API.reset();

      svg.addEventListener('wheel', onWheel, { passive: false });
      svg.addEventListener('pointerdown', onPointerDown);
      svg.addEventListener('pointermove', onPointerMove);
      svg.addEventListener('pointerup', onPointerUp);
      svg.addEventListener('pointercancel', onPointerUp);
      svg.addEventListener('dblclick', onDblClick);
      svg.addEventListener('click', onClick);

      obj.__SVGControl = API;

      cleanup = () => {
        svg.removeEventListener('wheel', onWheel);
        svg.removeEventListener('pointerdown', onPointerDown);
        svg.removeEventListener('pointermove', onPointerMove);
        svg.removeEventListener('pointerup', onPointerUp);
        svg.removeEventListener('pointercancel', onPointerUp);
        svg.removeEventListener('dblclick', onDblClick);
        svg.removeEventListener('click', onClick);
        try { delete obj.__SVGControl; } catch (e) { obj.__SVGControl = undefined; }
      };
    };

    try {
      if (obj.contentDocument && obj.contentDocument.readyState === 'complete') setup();
      else obj.addEventListener('load', setup, { once: true });
    } catch (err) {
      console.error('Initialization failed: Access to contentDocument denied', err);
    }
  };

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
