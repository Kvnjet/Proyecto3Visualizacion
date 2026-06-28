(function() {
  const state = {
    zoomEnabled: true,
    panEnabled: true,
    selectEnabled: true,
    selectionColor: 'red',
    callbacks: { zoom: null, pan: null, select: null, multiSelect: null, dblclick: null }
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
      let selectedElements = [];
      const originalStyles = new Map();

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

      const clearSelection = () => {
        selectedElements.forEach(element => {
          const old = originalStyles.get(element);
          if (old) {
            old.s ? element.setAttribute('stroke', old.s) : element.removeAttribute('stroke');
            old.sw ? element.setAttribute('stroke-width', old.sw) : element.removeAttribute('stroke-width');
          }
        });
        originalStyles.clear();
        selectedElements = [];
      };

      const applySelectionStyle = (element) => {
        if (!element || element === svg) return;
        
        if (!originalStyles.has(element)) {
          originalStyles.set(element, {
            s: element.getAttribute('stroke'),
            sw: element.getAttribute('stroke-width')
          });
        }
        
        if (!selectedElements.includes(element)) {
          selectedElements.push(element);
        }

        element.setAttribute('stroke', state.selectionColor);
        const ctm = svg.getScreenCTM();
        const scale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
        element.setAttribute('stroke-width', (2 / scale).toString());
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
        setSelectionColor: (color) => {
          state.selectionColor = color;
          selectedElements.forEach(el => el.setAttribute('stroke', color));
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
        select: (id, keepSelection = false) => {
          if (!state.selectEnabled) return;
          
          if (!keepSelection) {
            clearSelection();
          }
          
          const element = id ? svgDoc.getElementById(id) : null;
          if (element && element !== svg) {
            applySelectionStyle(element);
          }
          
          if (keepSelection && state.callbacks.multiSelect) {
            state.callbacks.multiSelect(selectedElements);
          } else if (state.callbacks.select) {
            state.callbacks.select(selectedElements[0] || null);
          }
        },
        selectMultiple: (ids) => {
          if (!state.selectEnabled) return;
          clearSelection();
          if (!Array.isArray(ids)) return;

          ids.forEach(id => {
            const element = svgDoc.getElementById(id);
            if (element && element !== svg) applySelectionStyle(element);
          });
        },
        filterByIds: (visibleSvgIds) => {
          const visibleSet = new Set(visibleSvgIds);
          const showAll = visibleSet.size === 0;
          svgDoc.querySelectorAll('[id]').forEach(el => {
            if (el === svg) return;
            if (showAll || visibleSet.has(el.id)) {
              el.removeAttribute('display');
            } else {
              el.setAttribute('display', 'none');
            }
          });
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
        if (e.button !== 0) return;


        clickTarget = e.target;
        isDragging = false;
        clickStart = { x: e.clientX, y: e.clientY, time: Date.now() };

        panning = true;
        panStart = { x: e.clientX, y: e.clientY };
      };

      const onPointerMove = (e) => {
        if (!panning) return;
        const dx = e.clientX - clickStart.x;
        const dy = e.clientY - clickStart.y;
        
        if (!isDragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
          isDragging = true;
          svg.style.cursor = 'grabbing';
          if (svg.setPointerCapture) {
            svg.setPointerCapture(e.pointerId);
          }
        }

        if (panning && isDragging) {
          const pDx = e.clientX - panStart.x;
          const pDy = e.clientY - panStart.y;
          API.pan(pDx, pDy);
          panStart = { x: e.clientX, y: e.clientY };
        }
      };

      const onPointerUp = (e) => {
        if (!panning) return;

        svg.style.cursor = 'default';
        if (svg.releasePointerCapture) {
          try { svg.releasePointerCapture(e.pointerId); } catch(ex) {}
        }
        
        panning = false;
      };

      const onClick = (e) => {
        const dist = Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y);
        if (isDragging || dist >= 6) {
          e.preventDefault();
          e.stopPropagation();
          clickTarget = null;
          return;
        }
        
        const el = clickTarget || e.target; 
        let node = el;
        while (node && node !== svg && !node.id) node = node.parentNode;
        const targetId = node && node !== svg ? node.id : null;
        
        API.select(targetId, e.shiftKey);
        clickTarget = null;
      };

      const onDblClick = (e) => {
        let node = e.target;
        while (node && node !== svg && !node.id) node = node.parentNode;
        const targetId = node && node !== svg ? node.id : null;
        //API.reset();
        if (targetId && state.callbacks.dblclick) {
          const element = svgDoc.getElementById(targetId);
          state.callbacks.dblclick(element);
        }
      };

      svg.addEventListener('wheel', onWheel, { passive: false });
      svg.addEventListener('pointerdown', onPointerDown);
      svg.addEventListener('pointermove', onPointerMove);
      svg.addEventListener('pointerup', onPointerUp);
      svg.addEventListener('pointercancel', onPointerUp);
      svg.addEventListener('dblclick', onDblClick);
      svg.addEventListener('click', onClick, { capture: true });

      obj.__SVGControl = API;

      cleanup = () => {
        svg.removeEventListener('wheel', onWheel);
        svg.removeEventListener('pointerdown', onPointerDown);
        svg.removeEventListener('pointermove', onPointerMove);
        svg.removeEventListener('pointerup', onPointerUp);
        svg.removeEventListener('pointercancel', onPointerUp);
        svg.removeEventListener('dblclick', onDblClick);
        svg.removeEventListener('click', onClick, { capture: true });
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