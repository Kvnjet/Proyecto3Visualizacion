class SimpleTable {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container "${containerId}" not found`);

    this.data = options.data || [];
    this.columns = options.columns || [];
    this.selectable = options.selectable || false;
    this.responsive = options.responsive ?? true;
    this.containerHeight = options.height || '100%';
	this.options = options;

    this.filteredData = [...this.data];
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.selectedRows = new Set();
    this.lastSelected = null;
    this.currentFilters = {};
    this.filterTimeout = null;

    this.table = null;
    this.tbody = null;
    this.colgroup = null;

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onResize = this.onResize.bind(this);

    this.init();
  }

  init() {
    this.container.innerHTML = '';
    this.container.className = 'simple-table-container';
    this.container.style.height = this.responsive ? this.containerHeight : '';

    this.createTable();
    this.render();

    if (this.responsive) {
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(this.onResize).observe(this.container);
      } else {
        window.addEventListener('resize', this.onResize);
      }
    }
  }

  createTable() {
    this.table = document.createElement('table');
    this.table.className = 'simple-table';
    
    this.colgroup = document.createElement('colgroup');
    const defaultWidth = 100 / Math.max(1, this.columns.length);
    this.columns.forEach(col => {
      const colEl = document.createElement('col');
      colEl.style.width = col.width || `${defaultWidth}%`;
      this.colgroup.appendChild(colEl);
    });
    this.table.appendChild(this.colgroup);

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const filterRow = document.createElement('tr');

    this.columns.forEach((col, index) => {
      headerRow.appendChild(this.createHeaderCell(col, index));
      filterRow.appendChild(this.createFilterCell(col));
    });

    thead.appendChild(headerRow);
    thead.appendChild(filterRow);
    this.table.appendChild(thead);

    this.tbody = document.createElement('tbody');
    this.table.appendChild(this.tbody);
    this.container.appendChild(this.table);
  }

  createHeaderCell(col, index) {
    const th = document.createElement('th');
    th.innerHTML = `<span>${col.title || col.field}</span><span class="sort-indicator">↕</span>`;
    
    th.addEventListener('click', (e) => {
      if (!e.target.classList.contains('resizer')) this.sort(col.field);
    });

    const resizer = document.createElement('div');
    resizer.className = 'resizer';
    resizer.addEventListener('mousedown', (e) => this.startResize(e, index));
    th.appendChild(resizer);

    return th;
  }

  createFilterCell(col) {
    const th = document.createElement('th');
    th.className = 'filter-cell';
    
    const isNumeric = col.type === 'number' || this.data.some(r => typeof r[col.field] === 'number');
    
    const inputContainer = isNumeric ? this.createRangeFilter(col.field) : this.createTextFilter(col.field);
    th.appendChild(inputContainer);
    return th;
  }

  createTextFilter(field) {
    const input = document.createElement('input');
    input.placeholder = 'Filtrar...';
    input.style.width = '100%';
    input.dataset.field = field;
    input.dataset.type = 'text';

    input.addEventListener('input', (e) => {
      clearTimeout(this.filterTimeout);
      this.filterTimeout = setTimeout(() => {
        this.currentFilters[field] = { type: 'text', value: e.target.value.toLowerCase() };
        this.applyFilters();
      }, 300);
    });
    return input;
  }

  createRangeFilter(field) {
    const div = document.createElement('div');
    div.style.display = 'flex';
    const createInp = (p) => {
      const i = document.createElement('input');
      i.type = 'number';
      i.placeholder = p;
      i.style.width = '50%';
      i.dataset.field = field;
      return i;
    };
    const min = createInp('Min'), max = createInp('Max');

    const onRangeInput = () => {
      clearTimeout(this.filterTimeout);
      this.filterTimeout = setTimeout(() => {
        this.currentFilters[field] = { type: 'range', min: min.value, max: max.value };
        this.applyFilters();
      }, 300);
    };

    min.addEventListener('input', onRangeInput);
    max.addEventListener('input', onRangeInput);
    div.append(min, max);
    return div;
  }

  applyFilters() {
      this.filteredData = this.data.filter(row => {
        return Object.entries(this.currentFilters).every(([field, filter]) => {
          const val = row[field];
          if (filter.type === 'text' && filter.value) {
            return String(val ?? '').toLowerCase().includes(filter.value);
          }
          if (filter.type === 'range') {
            const n = Number(val);
            const min = filter.min !== '' ? Number(filter.min) : -Infinity;
            const max = filter.max !== '' ? Number(filter.max) : Infinity;
            return n >= min && n <= max;
          }
          return true;
        });
      });

      if (this.sortColumn) this.sort(this.sortColumn, true);
      if (this.tbody) this.tbody.innerHTML = '';
      this.render();

      if (typeof this.options.onFilter === 'function') {
        this.options.onFilter(this.filteredData);
      }
    }

    sort(field, skipRender = false) {
      if (this.sortColumn === field) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortColumn = field;
        this.sortDirection = 'asc';
      }

      this.filteredData.sort((a, b) => {
        let va = a[field], vb = b[field];
        if (va === vb) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;

        const res = (va < vb) ? -1 : 1;
        return this.sortDirection === 'asc' ? res : -res;
      });

      if (!skipRender) {
        if (this.tbody) this.tbody.innerHTML = '';
        this.render();
      }
      this.updateSortIndicators();
    }

    render() {
      if (!this.tbody) return;
  
      if (this.tbody.children.length === 0) {
        if (this.filteredData.length === 0) {
          this.tbody.innerHTML = `<tr><td colspan="${this.columns.length}" style="text-align:center;padding:20px">No hay datos</td></tr>`;
          return;
        }

        const fragment = document.createDocumentFragment();
        this.filteredData.forEach((row) => {
          const tr = document.createElement('tr');
          tr._rowData = row;

          if (this.selectable) {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', (e) => {
              this.handleRowClick(e, row, tr);
            });
          }

          tr.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (typeof this.options.onRowDblClick === 'function') {
              this.options.onRowDblClick(row);
            }
          });

          this.columns.forEach(col => {
            const td = document.createElement('td');
            td.textContent = row[col.field] ?? '';
            tr.appendChild(td);
          });
          fragment.appendChild(tr);
        });
        this.tbody.appendChild(fragment);
      }

      Array.from(this.tbody.children).forEach(tr => {
        if (tr._rowData) {
          if (this.selectedRows.has(tr._rowData)) {
            tr.classList.add('selected');
          } else {
            tr.classList.remove('selected');
          }
        }
      });
    }
	
  updateSortIndicators() {
    const indicators = this.table.querySelectorAll('.sort-indicator');
    this.columns.forEach((col, i) => {
      if (this.sortColumn === col.field) {
        indicators[i].textContent = this.sortDirection === 'asc' ? '↑' : '↓';
      } else {
        indicators[i].textContent = '↕';
      }
    });
  }

    handleRowClick(e, row, tr) {
      if (e.shiftKey && this.lastSelected) {
        this.selectRange(this.lastSelected, row);
      } else {
        if (this.selectedRows.has(row)) {
          this.selectedRows.delete(row);
        } else {
          this.selectedRows.clear();
          this.selectedRows.add(row);
        }
      }
      this.lastSelected = row;
      this.render();

      if (typeof this.options.onRowSelect === 'function') {
        this.options.onRowSelect(Array.from(this.selectedRows));
      }
    }

  selectRange(startRow, endRow) {
    const start = this.filteredData.indexOf(startRow);
    const end = this.filteredData.indexOf(endRow);
    if (start === -1 || end === -1) return;
    const [low, high] = [Math.min(start, end), Math.max(start, end)];
    for (let i = low; i <= high; i++) this.selectedRows.add(this.filteredData[i]);
  }

  startResize(e, index) {
    e.preventDefault();
    this.resizingIdx = index;
    this.startX = e.clientX;
    this.startWidth = this.colgroup.children[index].offsetWidth;
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  onMouseMove(e) {
    const delta = e.clientX - this.startX;
    const newWidth = Math.max(50, this.startWidth + delta);
    this.colgroup.children[this.resizingIdx].style.width = `${newWidth}px`;
  }

  onMouseUp() {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    this.syncPercentages();
  }

  syncPercentages() {
    const tableWidth = this.table.offsetWidth;
    Array.from(this.colgroup.children).forEach((col, i) => {
      const w = (col.offsetWidth / tableWidth) * 100;
      col.style.width = `${w}%`;
      this.columns[i].width = `${w}%`;
    });
  }

  onResize() {
    if (this.table) this.table.style.width = '100%';
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.container.innerHTML = '';
  }
}