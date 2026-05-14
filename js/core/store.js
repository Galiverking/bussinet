// State management store - single source of truth

const Store = {
  _state: {
    jobs: [],
    expenses: [],
    currentTab: 'summary',
    userLoc: null,
    editingId: null,
    parsedBuf: [],
    queueParsedBuf: [],
    manFilter: 'all',
    delTargetId: null,
    isManualSort: false
  },
  _listeners: [],

  get(key) {
    return this._state[key];
  },

  set(key, value) {
    const oldValue = this._state[key];
    this._state[key] = value;
    this._notify(key, value, oldValue);
  },

  getAll() {
    return { ...this._state };
  },

  subscribe(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(f => f !== fn);
    };
  },

  _notify(key, value, oldValue) {
    this._listeners.forEach(fn => {
      fn(key, value, oldValue);
    });
  },

  // Helper getters
  getJobs() {
    return this._state.jobs;
  },

  getExpenses() {
    return this._state.expenses;
  },

  getUserLoc() {
    return this._state.userLoc;
  },

  getCurrentTab() {
    return this._state.currentTab;
  },

  // Initialize from localStorage
  initFromStorage() {
    try {
      const savedLoc = localStorage.getItem('logis_loc');
      if (savedLoc) {
        this._state.userLoc = JSON.parse(savedLoc);
      }

      const savedSort = localStorage.getItem('logis_manualSort');
      if (savedSort !== null) {
        this._state.isManualSort = savedSort === 'true';
      }
    } catch (e) {
      console.warn('[Store] Error loading from storage:', e);
    }
  }
};

export default Store;