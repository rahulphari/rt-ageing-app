import React, { useState, useEffect, useMemo } from 'react';
import { 
  Upload, FileText, CheckCircle, AlertCircle, 
  Clock, Search, Database, Save, RefreshCw,
  LayoutDashboard, History as HistoryIcon, X,
  Lock, Unlock, Edit3, Cloud, CloudOff, Filter, Sliders,
  Download, Activity
} from 'lucide-react';

// --- CONFIGURATION & TYPES ---

const FACILITY_FILTER = "Hubli_Budarshingi_H (Karnataka)";
// UPDATED URL provided by user
const INITIAL_API_URL = "https://script.google.com/macros/s/AKfycbxdVp1u3awN6rkYMZi-BfXpSwgLdRTZgDoatvyrxgSYmBWbVHiTbvOyGXrdqVQjie_ICQ/exec";
const SETTINGS_PASSKEY = "1732";

// --- HELPER: DATA NORMALIZATION ---
const normalizeWbn = (wbn) => {
  if (!wbn) return '';
  return String(wbn).replace(/[^a-zA-Z0-9]/g, '');
};

const cleanCsvWbn = (wbn) => {
  if (!wbn) return 'Unknown';
  return String(wbn).replace(/^['"=]+/, '').trim();
};

// --- HELPER: CUSTOM CSV PARSER ---
const parseCSV = (text) => {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuote = false;
   
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuote) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++; 
      } else if (char === '"') {
        inQuote = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuote = true;
      } else if (char === ',') {
        currentRow.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\n') {
        currentRow.push(currentVal.trim());
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];
   
  const headers = rows[0].map(h => h.replace(/^['"]|['"]$/g, '').trim());
  const data = rows.slice(1).map(row => {
    if (row.length === 1 && row[0] === '') return null;
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] || '';
    });
    return obj;
  }).filter(row => row !== null);

  return data;
};

// --- API SERVICES ---

const localService = {
  getData: async () => {
    const data = localStorage.getItem('return_ageing_db');
    return data ? JSON.parse(data) : { active: [], history: [] };
  },
  saveData: async (data) => {
    localStorage.setItem('return_ageing_db', JSON.stringify(data));
    return { success: true };
  }
};

const googleService = {
  getData: async (url) => {
    try {
      const separator = url.includes('?') ? '&' : '?';
      const noCacheUrl = `${url}${separator}t=${new Date().getTime()}`;
       
      const response = await fetch(noCacheUrl, {
        method: 'GET',
        redirect: 'follow'
      });
       
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
       
      const json = await response.json();
      return json;
    } catch (e) {
      console.error("Google Sheet Fetch Error:", e);
      // Helpful error message specifically for the "Failed to fetch" CORS/Permission issue
      if (e.message === 'Failed to fetch') {
        throw new Error("Access Denied. Please ensure your Google Script Deployment is set to 'Who has access: Anyone'.");
      }
      throw e;
    }
  },
  saveData: async (url, payload) => {
    // We use text/plain to avoid CORS preflight, and no-cors mode
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    return { success: true }; 
  }
};

// --- COMPONENTS ---

const StatusBadge = ({ ticket }) => {
  if (!ticket) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200 animate-pulse">
        <AlertCircle className="w-3 h-3 mr-1" />
        NO TICKET
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
      <Clock className="w-3 h-3 mr-1" />
      IN PROGRESS
    </span>
  );
};

const DataCell = ({ main, sub, icon: Icon, colorClass = "text-gray-500" }) => (
  <div className="flex flex-col">
    <span className="font-semibold text-gray-900 text-sm flex items-center gap-1">
      {Icon && <Icon size={12} className={colorClass} />}
      {main}
    </span>
    {sub && <span className="text-xs text-gray-500 font-mono mt-0.5">{sub}</span>}
  </div>
);

const StatsCard = ({ title, value, icon: Icon, color }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center space-x-4 transition-all hover:shadow-md">
    <div className={`p-3 rounded-lg ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
    </div>
  </div>
);

const SyncIndicator = ({ status }) => {
  if (status === 'saving') {
    return (
      <div className="flex items-center gap-2 text-blue-300 bg-blue-900/50 px-3 py-1 rounded-full text-xs font-medium animate-pulse">
        <RefreshCw size={12} className="animate-spin" />
        Saving...
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-red-300 bg-red-900/50 px-3 py-1 rounded-full text-xs font-medium">
        <CloudOff size={12} />
        Sync Error
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-emerald-300 bg-emerald-900/50 px-3 py-1 rounded-full text-xs font-medium transition-all">
      <Cloud size={12} />
      Synced
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('active'); 
  const [data, setData] = useState({ active: [], history: [] });
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState(INITIAL_API_URL);
   
  // UI States
  const [uploadStats, setUploadStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [dataSource, setDataSource] = useState('local'); 
  const [lastSaved, setLastSaved] = useState(null);
   
  // Filter States
  const [filters, setFilters] = useState({
    status: 'all',
    client: 'all',
    product: 'all',
    age: 'all'
  });
   
  // Settings Logic
  const [isSettingsLocked, setIsSettingsLocked] = useState(true);
  const [passkeyInput, setPasskeyInput] = useState('');
  const [bulkUpdateText, setBulkUpdateText] = useState('');

  // Initial Load
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = apiUrl 
        ? await googleService.getData(apiUrl) 
        : await localService.getData();
       
      setData({
        active: Array.isArray(result?.active) ? result.active : [],
        history: Array.isArray(result?.history) ? result.history : []
      });
      setSyncStatus('saved');
      setDataSource(apiUrl ? 'cloud' : 'local');
      setLastSaved(new Date());
    } catch (error) {
      console.error("Failed to load", error);
      // More descriptive error handling for the UI
      const msg = error.message.includes("Access Denied") 
        ? "Access Denied: Please check your Google Script deployment settings (Who has access: Anyone)." 
        : "Could not fetch data from Cloud. Using local backup.";
       
      setErrorMsg(msg);
       
      const localData = await localService.getData();
      setData(localData);
      setSyncStatus('error');
      setDataSource('local');
    } finally {
      setLoading(false);
    }
  };

  const saveDataToBackend = async (newData) => {
    setSyncStatus('saving');
    try {
      if (apiUrl) {
        // Calculate payload size for diagnostics
        const payloadStr = JSON.stringify(newData);
        const sizeKb = (payloadStr.length / 1024).toFixed(1);
        console.log(`Saving ${sizeKb}KB to backend...`);
         
        await googleService.saveData(apiUrl, newData);
      } else {
        await localService.saveData(newData);
      }
      setSyncStatus('saved');
      setLastSaved(new Date());
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      setErrorMsg("Failed to save changes. Check internet connection.");
    }
  };

  const forceSave = async () => {
    if (!apiUrl) return alert("No API URL configured");
    if (!window.confirm("This will force-overwrite the cloud data with your current view. Continue?")) return;
     
    setLoading(true);
    await saveDataToBackend(data);
    setLoading(false);
    alert("Force save command sent. Check Google Sheet for 'Data Chunks'.");
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsedData = parseCSV(text);
      processCsvData(parsedData);
    };
    reader.onerror = () => { alert("Failed to read file"); setLoading(false); };
    reader.readAsText(file);
  };

  const processCsvData = async (csvRows) => {
    const facilityRows = csvRows.filter(row => 
      row['facility'] && row['facility'].includes('Hubli_Budarshingi_H')
    );

    const incomingDataMap = new Map();
     
    facilityRows.forEach(row => {
      const rawWbn = row['wbn'] || 'Unknown';
      const cleanId = cleanCsvWbn(rawWbn);

      const item = {
        id: cleanId,
        wbn: cleanId, 
        bagid: row['bagid'] || '-',
        cl: row['cl'] || 'Unknown Client',
        pdt: row['pdt'] || '-',
        age_days: row['age_intime_days'] || '0',
        age_hours: row['age_intime_hours'] || '0',
        ntc_name: row['ntc_name'] || 'Unknown NTC',
        rcn: row['rcn'] || '-',
        remark: row['cs_sr'] || '-',
        updatedAt: new Date().toISOString(),
        jarvis_ticket: '',
        user_note: '', 
        status: 'New' 
      };
      incomingDataMap.set(cleanId, item);
    });

    const currentActive = [...data.active];
    const newActiveList = [];
    const resolvedList = [];
    let newCount = 0;
    let updatedCount = 0;

    currentActive.forEach(existingItem => {
      if (incomingDataMap.has(existingItem.id)) {
        const incoming = incomingDataMap.get(existingItem.id);
        newActiveList.push({
          ...incoming,
          jarvis_ticket: existingItem.jarvis_ticket, 
          user_note: existingItem.user_note || '',    
          status: 'Pending'
        });
        incomingDataMap.delete(existingItem.id);
        updatedCount++;
      } else {
        resolvedList.push({
          ...existingItem,
          resolvedAt: new Date().toISOString(),
          status: 'Resolved'
        });
      }
    });

    incomingDataMap.forEach((item) => {
      newActiveList.push(item);
      newCount++;
    });

    const newData = {
      active: newActiveList,
      history: [...resolvedList, ...data.history]
    };

    setData(newData);
    setUploadStats({ new: newCount, resolved: resolvedList.length, updated: updatedCount });
    await saveDataToBackend(newData);
    setLoading(false);
  };

  const updateItemField = (id, field, value) => {
    const updatedActive = data.active.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    );
    const newData = { ...data, active: updatedActive };
    setData(newData); 
    saveDataToBackend(newData); 
  };

  const handleBulkUpdate = () => {
    if (!bulkUpdateText.trim()) return;

    const lines = bulkUpdateText.trim().split('\n');
    const updatesMap = new Map(); 

    lines.forEach(line => {
      const cleanLine = line.replace(/['"]/g, '').trim();
      const parts = cleanLine.split(/\s+/);
       
      if (parts.length >= 2) {
        const rawWbn = parts[0].trim();
        const ticket = parts[1].trim();
        if (rawWbn && ticket) {
           updatesMap.set(normalizeWbn(rawWbn), ticket);
        }
      }
    });

    if (updatesMap.size === 0) {
      alert("Could not parse any valid lines. Please ensure format is: WBN [space] TICKET");
      return;
    }

    let updateCount = 0;
     
    const newActiveList = data.active.map(item => {
      const normalizedStoredWbn = normalizeWbn(item.wbn);
      if (updatesMap.has(normalizedStoredWbn)) {
        const newTicket = updatesMap.get(normalizedStoredWbn);
        if (item.jarvis_ticket !== newTicket) {
          updateCount++;
          return { ...item, jarvis_ticket: newTicket };
        }
      }
      return item;
    });

    if (updateCount > 0) {
      const newData = { ...data, active: newActiveList };
      setData(newData);
      saveDataToBackend(newData);
      alert(`Success! Updated ${updateCount} tickets.`);
      setBulkUpdateText(''); 
    } else {
      alert(`No updates made.\n\n- Parsed ${updatesMap.size} valid lines from your text.\n- Checked ${data.active.length} active items.\n\nPlease check if the WBNs match.`);
    }
  };

  const unlockSettings = () => {
    if (passkeyInput === SETTINGS_PASSKEY) {
      setIsSettingsLocked(false);
      setPasskeyInput('');
    } else {
      alert("Incorrect Passkey");
    }
  };

  // --- FILTER & SORT LOGIC ---

  const uniqueClients = useMemo(() => {
    return [...new Set(data.active.map(i => i.cl))].sort();
  }, [data.active]);

  const uniqueProducts = useMemo(() => {
    return [...new Set(data.active.map(i => i.pdt))].sort();
  }, [data.active]);

  const filteredActive = useMemo(() => {
    let result = data.active.filter(item => {
      const matchesSearch = 
        item.wbn.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.cl.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.jarvis_ticket && item.jarvis_ticket.toLowerCase().includes(searchTerm.toLowerCase()));
       
      if (!matchesSearch) return false;

      if (filters.client !== 'all' && item.cl !== filters.client) return false;
      if (filters.product !== 'all' && item.pdt !== filters.product) return false;

      if (filters.status === 'missing_ticket' && item.jarvis_ticket) return false;
      if (filters.status === 'has_ticket' && !item.jarvis_ticket) return false;

      if (filters.age !== 'all') {
        const days = parseInt(item.age_days) || 0;
        if (filters.age === 'critical' && days < 15) return false;
        if (filters.age === 'warning' && (days < 7 || days >= 15)) return false;
        if (filters.age === 'normal' && days >= 7) return false;
      }

      return true;
    });

    result.sort((a, b) => {
      const ageA = parseFloat(a.age_hours) || 0;
      const ageB = parseFloat(b.age_hours) || 0;
      return ageB - ageA; 
    });

    return result;
  }, [data.active, searchTerm, filters]);

  // --- DOWNLOAD REPORT ---
  const handleDownloadReport = () => {
    const reportData = activeTab === 'active' ? filteredActive : data.history;
     
    // Headers matching the schema
    const headers = [
      "WBN", "Bag ID", "Client", "Product", 
      "Age (Days)", "Age (Hours)", 
      "NTC Name", "RCN", "Remark", 
      "Jarvis Ticket", "User Note", "Status", "Last Updated"
    ];

    const csvContent = [
      headers.join(','),
      ...reportData.map(row => [
        `"${row.wbn}"`,
        `"${row.bagid}"`,
        `"${row.cl}"`,
        `"${row.pdt}"`,
        row.age_days || 0,
        row.age_hours || 0,
        `"${row.ntc_name}"`,
        `"${row.rcn}"`,
        `"${(row.remark || '').replace(/"/g, '""')}"`, // Escape quotes
        `"${row.jarvis_ticket || ''}"`,
        `"${(row.user_note || '').replace(/"/g, '""')}"`,
        row.status,
        row.updatedAt || row.resolvedAt
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `return_ageing_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- RENDER HELPERS ---
  const resetFilters = () => setFilters({ status: 'all', client: 'all', product: 'all', age: 'all' });

  const stats = {
    pending: data.active.length,
    missingTicket: data.active.filter(i => !i.jarvis_ticket).length,
    resolved: data.history.length,
    oldest: data.active.length > 0 ? Math.max(...data.active.map(i => parseInt(i.age_days) || 0)) : 0
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
       
      {/* HEADER */}
      <header className="bg-slate-900 text-white p-6 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="text-blue-400" />
              Return Ageing <span className="text-blue-400">Hubli_H</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Operational Analytics
              {dataSource === 'local' && <span className="ml-2 text-xs bg-amber-600 px-2 py-0.5 rounded text-white">Offline Mode</span>}
              {dataSource === 'cloud' && <span className="ml-2 text-xs bg-green-900 text-green-200 px-2 py-0.5 rounded">Cloud Active</span>}
            </p>
          </div>
           
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
               <SyncIndicator status={syncStatus} />
               {lastSaved && <span className="text-[10px] text-gray-400 mt-1">Last Saved: {lastSaved.toLocaleTimeString()}</span>}
            </div>
            
             <button 
              onClick={handleDownloadReport}
              className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg transition-colors shadow-sm"
              title="Download CSV Report"
             >
               <Download size={20} />
             </button>

             <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm">
              <Upload size={18} />
              Upload Latest CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
            </label>
            <button 
              onClick={loadData}
              className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg transition-colors shadow-sm"
              title="Refresh Data"
            >
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* STATS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total Pending" value={stats.pending} icon={FileText} color="bg-blue-500" />
          <StatsCard title="Action Req (No Ticket)" value={stats.missingTicket} icon={AlertCircle} color="bg-red-500" />
          <StatsCard title="Total Resolved" value={stats.resolved} icon={CheckCircle} color="bg-emerald-500" />
          <StatsCard title="Max Ageing (Days)" value={`${stats.oldest} Days`} icon={Clock} color="bg-purple-500" />
        </div>

        {/* NOTIFICATIONS */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle size={18} /> {errorMsg}
          </div>
        )}
        {uploadStats && (
          <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-4 shadow-sm">
            <div className="flex gap-4">
              <span className="font-bold">Delta Report:</span>
              <span><span className="font-bold text-emerald-600">+{uploadStats.new}</span> New</span>
              <span><span className="font-bold text-blue-600">{uploadStats.updated}</span> Persistent</span>
              <span><span className="font-bold text-gray-500">{uploadStats.resolved}</span> Resolved</span>
            </div>
            <button onClick={() => setUploadStats(null)}><X size={18} /></button>
          </div>
        )}

        {/* CONTROLS & FILTER BAR */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
          {/* Top Row: Navigation and Search */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-100 pb-4">
            <div className="flex gap-4 w-full md:w-auto">
              <button 
                onClick={() => setActiveTab('active')}
                className={`pb-1 font-medium text-sm transition-colors relative ${activeTab === 'active' ? 'text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <span className="flex items-center gap-2"><LayoutDashboard size={16}/> Active Monitor</span>
                {activeTab === 'active' && <span className="absolute bottom-[-5px] left-0 w-full h-0.5 bg-blue-600"></span>}
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`pb-1 font-medium text-sm transition-colors relative ${activeTab === 'history' ? 'text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <span className="flex items-center gap-2"><HistoryIcon size={16}/> History</span>
                {activeTab === 'history' && <span className="absolute bottom-[-5px] left-0 w-full h-0.5 bg-blue-600"></span>}
              </button>
              <button 
                onClick={() => setActiveTab('settings')}
                className={`pb-1 font-medium text-sm transition-colors relative ${activeTab === 'settings' ? 'text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Settings
              </button>
            </div>

            <div className="relative w-full md:w-auto">
              <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search WBN or Ticket..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64 shadow-sm bg-slate-50"
              />
            </div>
          </div>

          {/* Filter Row */}
          {activeTab === 'active' && (
             <div className="flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
                  <Sliders size={16} /> Filters:
                </div>

                <select 
                  className="bg-gray-50 border border-gray-300 text-gray-700 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
                  value={filters.status}
                  onChange={(e) => setFilters({...filters, status: e.target.value})}
                >
                  <option value="all">All Statuses</option>
                  <option value="missing_ticket">Action Required (No Ticket)</option>
                  <option value="has_ticket">In Progress (Has Ticket)</option>
                </select>

                <select 
                  className="bg-gray-50 border border-gray-300 text-gray-700 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
                  value={filters.age}
                  onChange={(e) => setFilters({...filters, age: e.target.value})}
                >
                  <option value="all">All Ages</option>
                  <option value="critical">Critical (15+ Days)</option>
                  <option value="warning">Warning (7-14 Days)</option>
                  <option value="normal">Normal (0-7 Days)</option>
                </select>

                <select 
                  className="bg-gray-50 border border-gray-300 text-gray-700 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 max-w-[150px]"
                  value={filters.client}
                  onChange={(e) => setFilters({...filters, client: e.target.value})}
                >
                  <option value="all">All Clients</option>
                  {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select 
                  className="bg-gray-50 border border-gray-300 text-gray-700 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 max-w-[150px]"
                  value={filters.product}
                  onChange={(e) => setFilters({...filters, product: e.target.value})}
                >
                  <option value="all">All Products</option>
                  {uniqueProducts.map(p => <option key={p} value={p}>{p}</option>)}
                </select>

                <button 
                  onClick={resetFilters}
                  className="ml-auto text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Reset All
                </button>
             </div>
          )}
        </div>

        {/* ACTIVE TABLE VIEW */}
        {activeTab === 'active' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">WBN / Bag ID</th>
                    <th className="px-6 py-4">Client / Product</th>
                    <th className="px-6 py-4">Ageing <span className="text-gray-400 text-[10px] ml-1">(Default: High-Low)</span></th>
                    <th className="px-6 py-4">Original Remark</th>
                    <th className="px-6 py-4 w-48 bg-blue-50/50 border-l border-blue-100 text-blue-800">
                      Jarvis Ticket
                    </th>
                    <th className="px-6 py-4 w-48 bg-yellow-50/50 border-l border-yellow-100 text-yellow-800">
                      User Note
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredActive.length === 0 ? (
                    <tr><td colSpan="7" className="p-8 text-center text-gray-400">
                      {apiUrl ? "No records match your filters." : "Upload a CSV to begin."}
                    </td></tr>
                  ) : filteredActive.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4 align-top">
                        <StatusBadge ticket={row.jarvis_ticket} />
                      </td>
                      <td className="px-6 py-4 align-top">
                        <DataCell main={row.wbn} sub={`Bag: ${row.bagid}`} />
                      </td>
                      <td className="px-6 py-4 align-top">
                        <DataCell main={row.cl} sub={row.pdt} />
                      </td>
                      <td className="px-6 py-4 align-top">
                          <div className="flex flex-col">
                            <span className={`font-bold text-sm ${parseFloat(row.age_days) >= 15 ? 'text-red-600' : 'text-gray-800'}`}>
                              {row.age_days} Days
                            </span>
                            <span className="text-xs text-gray-500 font-mono">({row.age_hours} Hrs)</span>
                          </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                         <span className="text-xs text-gray-500 line-clamp-2">{row.remark}</span>
                      </td>
                      <td className="px-6 py-4 align-top bg-blue-50/30 border-l border-blue-50">
                        <input 
                          type="text" 
                          placeholder="Ticket #"
                          value={row.jarvis_ticket || ''}
                          onChange={(e) => updateItemField(row.id, 'jarvis_ticket', e.target.value)}
                          className={`w-full px-3 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none transition-all ${
                            row.jarvis_ticket ? 'bg-white border-gray-300' : 'bg-red-50 border-red-200 placeholder-red-300'
                          }`}
                        />
                      </td>
                      <td className="px-6 py-4 align-top bg-yellow-50/30 border-l border-yellow-50">
                        <input 
                          type="text" 
                          placeholder="Add Note..."
                          value={row.user_note || ''}
                          onChange={(e) => updateItemField(row.id, 'user_note', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border border-yellow-200 bg-white rounded focus:ring-2 focus:ring-yellow-500 outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* HISTORY VIEW */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold mb-4 text-gray-700">Resolution History</h2>
            <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-gray-50 text-gray-500">
                   <tr>
                     <th className="p-3">WBN</th>
                     <th className="p-3">Client</th>
                     <th className="p-3">Resolved Date</th>
                     <th className="p-3">Final Ticket</th>
                     <th className="p-3">User Note</th>
                   </tr>
                 </thead>
                 <tbody>
                    {data.history.length === 0 ? (
                       <tr><td colSpan="5" className="p-6 text-center text-gray-400">No resolved items yet.</td></tr>
                    ) : (
                      data.history.slice(0, 50).map((h, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="p-3 font-mono">{h.wbn}</td>
                          <td className="p-3">{h.cl}</td>
                          <td className="p-3 text-gray-500">{new Date(h.resolvedAt).toLocaleDateString()}</td>
                          <td className="p-3 font-medium text-emerald-600">{h.jarvis_ticket || 'No Ticket'}</td>
                          <td className="p-3 text-gray-500">{h.user_note || '-'}</td>
                        </tr>
                      ))
                    )}
                 </tbody>
               </table>
            </div>
          </div>
        )}

        {/* SETTINGS VIEW */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-8 mt-8">
             <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
               <Save className="text-blue-600"/> Database & Tools
             </h2>

             {isSettingsLocked ? (
               <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg border border-gray-200 text-center">
                 <Lock className="w-12 h-12 text-gray-400 mb-4" />
                 <h3 className="text-lg font-bold text-gray-700 mb-2">Restricted Access</h3>
                 <p className="text-gray-500 mb-4 text-sm">Enter the operational passkey to access bulk tools.</p>
                 <div className="flex gap-2">
                   <input 
                    type="password" 
                    value={passkeyInput}
                    onChange={(e) => setPasskeyInput(e.target.value)}
                    className="border border-gray-300 rounded px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Passkey"
                   />
                   <button 
                    onClick={unlockSettings}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                   >
                     Unlock
                   </button>
                 </div>
               </div>
             ) : (
               <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  
                  {/* BULK UPDATE TOOL */}
                  <div className="border border-indigo-100 bg-indigo-50/50 p-6 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Edit3 className="text-indigo-600" size={20} />
                      <h3 className="font-bold text-indigo-900">Bulk Ticket Updater</h3>
                    </div>
                    <p className="text-xs text-indigo-700 mb-2">
                      Paste data in format: <code>WBN [space/tab] TICKET</code>. 
                      Supports Excel/Sheet copy-paste.
                    </p>
                    <textarea 
                      className="w-full h-32 p-3 text-sm font-mono border border-indigo-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder={`1490819358241102\tJ1764492216110720\n1490821687098391\tJ1765102973005439`}
                      value={bulkUpdateText}
                      onChange={(e) => setBulkUpdateText(e.target.value)}
                    />
                    <button 
                      onClick={handleBulkUpdate}
                      className="mt-3 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors w-full"
                    >
                      Process Bulk Updates
                    </button>
                  </div>

                  {/* DIAGNOSTICS */}
                  <div className="border border-amber-100 bg-amber-50/50 p-6 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity className="text-amber-600" size={20} />
                      <h3 className="font-bold text-amber-900">Diagnostics & Force Save</h3>
                    </div>
                    <p className="text-xs text-amber-800 mb-4">
                      Use this if synchronization seems stuck. It will attempt to force-write the current browser state to the cloud.
                    </p>
                    <div className="flex gap-4">
                        <button 
                         onClick={forceSave}
                         className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                       >
                         Force Save to Cloud
                       </button>
                    </div>
                  </div>

                  {/* CONNECTION CONFIG */}
                  <div className="border-t border-gray-100 pt-6">
                    <h3 className="font-bold text-gray-700 mb-4">Connection Settings</h3>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Web App URL</label>
                    <input 
                      type="text" 
                      value={apiUrl}
                      onChange={(e) => {
                        setApiUrl(e.target.value);
                        localStorage.setItem('gas_api_url', e.target.value);
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono text-gray-500 bg-gray-50"
                    />
                    <button 
                      onClick={() => { setIsSettingsLocked(true); }}
                      className="mt-4 text-gray-500 text-sm hover:text-gray-800 flex items-center gap-1"
                    >
                      <Lock size={14} /> Lock Settings
                    </button>
                  </div>
               </div>
             )}
          </div>
        )}

      </main>
    </div>
  );
}