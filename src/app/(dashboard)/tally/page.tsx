'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight,
  Database,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
  RefreshCw,
  Search,
  Server,
  FileCode,
  ShieldCheck,
  Building,
  HelpCircle,
  Save,
} from 'lucide-react';
import { TallyPartyMapping, TallySyncLog, Customer } from '@/types';
import { getClientAuthToken, getCurrentUser, isAdmin } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function TallyIntegrationPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  const [tallyConfig, setTallyConfig] = useState({
    serverUrl: 'http://localhost:9000',
    companyName: 'SHOWHOUSE',
    salesLedgerName: 'Sales - Laminates & Surfaces',
    gstLedgerName: 'Output GST 18%',
  });

  const [stats, setStats] = useState({
    totalVouchers: 0,
    syncedCount: 0,
    pendingCount: 0,
    failedCount: 0,
    partyMappingsCount: 0,
  });

  const [mappings, setMappings] = useState<TallyPartyMapping[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<TallySyncLog[]>([]);
  const [activeTab, setActiveTab] = useState<'sync' | 'mappings' | 'logs' | 'guide'>('sync');

  // Mapping edit state
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [tallyLedgerName, setTallyLedgerName] = useState('');
  const [tallyParentGroup, setTallyParentGroup] = useState('Sundry Debtors');
  const [savingMapping, setSavingMapping] = useState(false);

  const isAdministrator = isAdmin();

  const loadData = async () => {
    try {
      setLoading(true);
      const token = getClientAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [resTally, resCust] = await Promise.all([
        fetch('/api/tally', { headers }),
        fetch('/api/customers', { headers }),
      ]);

      if (resTally.ok) {
        const d = await resTally.json();
        setTallyConfig(d.tallyConfig || tallyConfig);
        setStats(d.stats || stats);
        setMappings(d.mappings || []);
        setLogs(d.logs || []);
      }

      if (resCust.ok) {
        const cd = await resCust.json();
        setCustomers(cd.customers || []);
      }
    } catch (err) {
      console.error('Failed to load Tally integration data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle Direct Sync to TallyPrime (Port 9000)
  const handleDirectSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      const token = getClientAuthToken();

      const res = await fetch('/api/tally', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'direct_sync' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSyncResult({
          success: false,
          message: data.error || 'Connection to TallyPrime HTTP server failed.',
        });
      } else {
        setSyncResult({
          success: true,
          message: `Successfully synchronized ${data.syncedCount || 0} vouchers directly to TallyPrime!`,
        });
      }
      await loadData();
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err.message || 'Direct sync failed. Check if TallyPrime is open on Port 9000.',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Handle Test Connection
  const handleTestConnection = async () => {
    try {
      setTestingConnection(true);
      setSyncResult(null);
      const token = getClientAuthToken();

      const res = await fetch('/api/tally', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'test_connection' }),
      });

      const d = await res.json();
      if (d.success) {
        setSyncResult({ success: true, message: d.message });
      } else {
        setSyncResult({
          success: false,
          message: d.error || `Unable to reach TallyPrime at ${tallyConfig.serverUrl}`,
        });
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: `Connection failed: ${err.message}. Make sure TallyPrime ODBC/HTTP is enabled.`,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Handle Download XML File
  const handleDownloadXml = () => {
    const token = getClientAuthToken();
    const url = `/api/tally/export-xml?types=challans,payments,returns${
      token ? `&token=${encodeURIComponent(token)}` : ''
    }`;
    window.open(url, '_blank');
  };

  // Handle Save Party Mapping
  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustomer) return;

    try {
      setSavingMapping(true);
      const token = getClientAuthToken();

      const res = await fetch('/api/tally', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'save_mapping',
          customer_id: editCustomer.id,
          customer_name: editCustomer.name,
          tally_ledger_name: tallyLedgerName.trim() || editCustomer.name,
          tally_parent_group: tallyParentGroup,
        }),
      });

      const d = await res.json();
      if (d.success) {
        setEditCustomer(null);
        await loadData();
      } else {
        alert(d.error || 'Failed to save mapping');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    } finally {
      setSavingMapping(false);
    }
  };

  if (!isAdministrator) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-lg mx-auto my-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-red-900">Access Restricted</h2>
        <p className="text-xs text-red-700 mt-1">
          TallyPrime Integration and XML Ledger synchronization is restricted strictly to Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-zinc-950 text-amber-500 rounded-lg">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-zinc-900">
                  TallyPrime Integration
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-medium">
                Official Tally XML export-import engine and live localhost connector for Showhouse ERP
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadXml}
            className="btn-primary py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <Download size={14} />
            <span>Download Tally XML</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Total Vouchers Ready
          </span>
          <p className="text-2xl font-black text-zinc-900 mt-2">{stats.totalVouchers}</p>
          <span className="text-[10px] text-zinc-400">Sales, Receipts & Credit Notes</span>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Synced Batches
          </span>
          <p className="text-2xl font-black text-emerald-600 mt-2">{stats.syncedCount}</p>
          <span className="text-[10px] text-zinc-400">Vouchers exported/pushed</span>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Party Mappings
          </span>
          <p className="text-2xl font-black text-zinc-900 mt-2">{mappings.length}</p>
          <span className="text-[10px] text-zinc-400">Ledgers mapped to Sundry Debtors</span>
        </div>

        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Tally Host Port
          </span>
          <p className="text-xl font-mono font-bold text-zinc-900 mt-2">Port 9000</p>
          <span className="text-[10px] text-emerald-600 font-semibold">TallyPrime XML Connector</span>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
            syncResult.success
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-amber-50 border-amber-300 text-amber-800'
          }`}
        >
          {syncResult.success ? (
            <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-600" />
          )}
          <div className="flex-1">
            <span className="font-bold block text-sm">
              {syncResult.success ? 'Sync Successful' : 'Sync Notification'}
            </span>
            <p className="mt-0.5">{syncResult.message}</p>
            {!syncResult.success && (
              <p className="mt-1 text-[11px] text-zinc-600">
                Tip: You can always click "Download Tally XML" to get the XML file and load it manually in Tally via Import &gt; Transactions.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-surface-200 pb-2 text-xs font-bold">
        <button
          onClick={() => setActiveTab('sync')}
          className={`px-4 py-2 rounded-lg transition-all ${
            activeTab === 'sync'
              ? 'bg-zinc-950 text-white shadow-2xs'
              : 'text-surface-600 hover:bg-surface-100'
          }`}
        >
          Live Sync & Configuration
        </button>
        <button
          onClick={() => setActiveTab('mappings')}
          className={`px-4 py-2 rounded-lg transition-all ${
            activeTab === 'mappings'
              ? 'bg-zinc-950 text-white shadow-2xs'
              : 'text-surface-600 hover:bg-surface-100'
          }`}
        >
          Party Ledger Mappings ({customers.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-lg transition-all ${
            activeTab === 'logs'
              ? 'bg-zinc-950 text-white shadow-2xs'
              : 'text-surface-600 hover:bg-surface-100'
          }`}
        >
          Sync Audit Logs ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab('guide')}
          className={`px-4 py-2 rounded-lg transition-all ${
            activeTab === 'guide'
              ? 'bg-zinc-950 text-white shadow-2xs'
              : 'text-surface-600 hover:bg-surface-100'
          }`}
        >
          Tally Import Guide
        </button>
      </div>

      {/* Tab 1: Live Sync & Config */}
      {activeTab === 'sync' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Action Box */}
          <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
              <Server size={16} className="text-amber-600" />
              <span>Direct Tally Connector Actions</span>
            </h3>

            <p className="text-xs text-zinc-600">
              When TallyPrime is running on the accountant's computer with ODBC/XML port enabled, you can push all pending challans, payments, and returns with a single click.
            </p>

            <div className="space-y-3 pt-2">
              <button
                onClick={handleDirectSync}
                disabled={syncing}
                className="w-full btn-primary py-3 text-xs font-bold flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
              >
                {syncing ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Synchronizing with TallyPrime...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={16} />
                    <span>Push Pending Vouchers to TallyPrime (Port 9000)</span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-3 py-2 text-xs font-semibold text-zinc-700 bg-surface-100 hover:bg-surface-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  {testingConnection ? <RefreshCw size={13} className="animate-spin" /> : <Server size={13} />}
                  <span>Test Connection</span>
                </button>

                <button
                  onClick={handleDownloadXml}
                  className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download size={13} />
                  <span>Download XML</span>
                </button>
              </div>
            </div>
          </div>

          {/* Config Box */}
          <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-2xs space-y-3 text-xs">
            <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
              <Settings size={16} className="text-zinc-600" />
              <span>TallyPrime Configuration Settings</span>
            </h3>

            <div className="space-y-2 pt-1 font-mono text-[11px]">
              <div className="flex justify-between py-1.5 border-b border-surface-100">
                <span className="text-zinc-500 font-sans">Tally Server Endpoint:</span>
                <span className="font-bold text-zinc-800">{tallyConfig.serverUrl}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-100">
                <span className="text-zinc-500 font-sans">Tally Company Name:</span>
                <span className="font-bold text-zinc-800">{tallyConfig.companyName}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-100">
                <span className="text-zinc-500 font-sans">Sales Ledger Mapping:</span>
                <span className="font-bold text-zinc-800">{tallyConfig.salesLedgerName}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-zinc-500 font-sans">GST Output Ledger:</span>
                <span className="font-bold text-zinc-800">{tallyConfig.gstLedgerName}</span>
              </div>
            </div>

            <div className="p-3 bg-surface-50 rounded-lg border border-surface-200 text-zinc-500 text-[11px]">
              Settings are stored in the core ERP system and can be customized in Company Settings.
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Party Ledger Mappings */}
      {activeTab === 'mappings' && (
        <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 bg-surface-50 border-b border-surface-200 flex justify-between items-center text-xs">
            <div>
              <h3 className="font-bold text-zinc-900">Showhouse Party to Tally Ledger Mapping</h3>
              <p className="text-[11px] text-zinc-500">
                Ensure each party matches the exact Sundry Debtor ledger name in your Tally Company.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-50 border-b border-surface-200 text-surface-600 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">ERP Customer Name</th>
                  <th className="px-4 py-3">Tally Ledger Name</th>
                  <th className="px-4 py-3">Parent Group in Tally</th>
                  <th className="px-4 py-3">GSTIN</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {customers.map((c) => {
                  const mapped = mappings.find((m) => m.customer_id === c.id);
                  const ledgerName = mapped?.tally_ledger_name || c.name || c.business_name || '';
                  const group = mapped?.tally_parent_group || 'Sundry Debtors';

                  return (
                    <tr key={c.id} className="hover:bg-surface-50/70 transition-colors">
                      <td className="px-4 py-3 font-bold text-zinc-900">{c.name || c.business_name}</td>
                      <td className="px-4 py-3 font-mono text-zinc-800">{ledgerName}</td>
                      <td className="px-4 py-3 text-surface-600">{group}</td>
                      <td className="px-4 py-3 text-surface-600 font-mono text-[11px]">
                        {c.gstin || 'Unregistered'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {mapped ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
                            Custom Mapped
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-100 text-surface-600">
                            Exact Name Default
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setEditCustomer(c);
                            setTallyLedgerName(ledgerName);
                            setTallyParentGroup(group);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
                        >
                          Edit Mapping
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Sync Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 bg-surface-50 border-b border-surface-200 text-xs">
            <h3 className="font-bold text-zinc-900">Tally XML Export & Sync Audit Trail</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-50 border-b border-surface-200 text-surface-600 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Vouchers</th>
                  <th className="px-4 py-3">Result / Response Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-surface-400">
                      No Tally sync logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-50/70 transition-colors">
                      <td className="px-4 py-3 text-surface-600 whitespace-nowrap">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-900 uppercase text-[11px]">
                        {(log.action || log.voucher_type || 'Sync').replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.status === 'success'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                              : log.status === 'failed'
                              ? 'bg-red-50 text-red-700 border border-red-300'
                              : 'bg-blue-50 text-blue-700 border border-blue-300'
                          }`}
                        >
                          {log.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-zinc-800">
                        {log.records_synced}
                      </td>
                      <td className="px-4 py-3 text-surface-700 max-w-[300px] truncate">
                        {log.message}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Guide */}
      {activeTab === 'guide' && (
        <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-2xs space-y-4 text-xs">
          <h3 className="font-bold text-base text-zinc-900 flex items-center gap-2">
            <HelpCircle size={18} className="text-primary-600" />
            <span>How to Import Showhouse Data into TallyPrime</span>
          </h3>

          <div className="space-y-4 pt-2 text-zinc-700 leading-relaxed">
            <div className="p-4 bg-surface-50 rounded-xl border border-surface-200 space-y-2">
              <span className="font-bold text-zinc-900 block text-sm">Method 1: Direct File Import (Simplest & Recommended)</span>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Click <strong>"Download Tally XML"</strong> at the top right of this page.</li>
                <li>Save the downloaded file (e.g. <code>TallyPrime_Sync_2026.xml</code>) to your computer.</li>
                <li>Open <strong>TallyPrime</strong> and select your Company.</li>
                <li>Press <kbd className="px-1.5 py-0.5 bg-white border rounded font-mono text-[11px]">Alt + O</kbd> (Import) or navigate to <strong>Import &gt; Transactions</strong>.</li>
                <li>Select File Format as <strong>XML</strong> and specify the path to your downloaded XML file.</li>
                <li>TallyPrime will import all Delivery Notes, Sales Invoices, Receipt Vouchers, and Credit Notes immediately.</li>
              </ol>
            </div>

            <div className="p-4 bg-surface-50 rounded-xl border border-surface-200 space-y-2">
              <span className="font-bold text-zinc-900 block text-sm">Method 2: Direct HTTP Port 9000 Connector</span>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>In TallyPrime, press <kbd className="px-1.5 py-0.5 bg-white border rounded font-mono text-[11px]">F12</kbd> (Configure) &gt; <strong>Advanced Configuration</strong>.</li>
                <li>Set <strong>"Enable ODBC Server"</strong> to <strong>Yes</strong> and set Port to <strong>9000</strong>.</li>
                <li>Restart TallyPrime.</li>
                <li>Click <strong>"Push Pending Vouchers to TallyPrime"</strong> on this page. All vouchers will be posted directly over HTTP without saving files!</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Edit Party Mapping Modal */}
      {editCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-surface-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <h3 className="font-bold text-base text-zinc-900">Map Customer to Tally</h3>
              <button
                onClick={() => setEditCustomer(null)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMapping} className="py-4 space-y-3.5 text-xs">
              <div className="space-y-1">
                <span className="font-semibold text-zinc-500 block text-[10px] uppercase">ERP Customer Name</span>
                <p className="font-bold text-zinc-900 text-sm">{editCustomer.name}</p>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Tally Exact Ledger Name *</label>
                <input
                  type="text"
                  value={tallyLedgerName}
                  onChange={(e) => setTallyLedgerName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-mono focus:outline-none focus:border-primary-500"
                  required
                />
                <span className="text-[10px] text-zinc-400">Must match the ledger name in TallyPrime exactly</span>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700">Parent Group in Tally</label>
                <input
                  type="text"
                  value={tallyParentGroup}
                  onChange={(e) => setTallyParentGroup(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg font-mono focus:outline-none focus:border-primary-500"
                  required
                />
                <span className="text-[10px] text-zinc-400">Usually "Sundry Debtors"</span>
              </div>

              <div className="pt-3 border-t border-surface-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditCustomer(null)}
                  className="px-4 py-2 font-semibold text-surface-600 hover:bg-surface-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMapping}
                  className="btn-primary py-2 px-5 font-bold shadow-xs disabled:opacity-50"
                >
                  {savingMapping ? 'Saving...' : 'Save Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

