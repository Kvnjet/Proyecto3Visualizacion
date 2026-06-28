class SimpleDetail {
  constructor(options = {}) {
    this.title = options.title || 'Details';
    this.container = null;
    this.overlay = null;
    this.init();
  }

  init() {
    if (document.getElementById('simple-detail-overlay')) return;

    this.overlay = document.createElement('div');
    this.overlay.id = 'simple-detail-overlay';

    this.container = document.createElement('div');
    this.container.className = 'simple-detail-box';

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    document.body.appendChild(this.overlay);
  }

  show(rowData, columns) {
    if (!rowData) return;
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'simple-detail-header';
    header.innerHTML = `<h3>${this.title}</h3>`;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'simple-detail-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'simple-detail-body';

    columns.forEach(col => {
      if (col.field === '_rowId') return;

      const row = document.createElement('div');
      row.className = 'simple-detail-field';

      const label = document.createElement('span');
      label.className = 'simple-detail-label';
      label.textContent = col.title || col.field;

      const value = document.createElement('span');
      value.className = 'simple-detail-value';
      value.textContent = rowData[col.field] ?? 'N/A';

      row.appendChild(label);
      row.appendChild(value);
      body.appendChild(row);
    });

    this.container.appendChild(body);
    this.overlay.appendChild(this.container);
    this.overlay.classList.add('active');
  }

  close() {
    if (this.overlay) this.overlay.classList.remove('active');
  }

}