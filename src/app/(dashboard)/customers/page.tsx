'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  Users,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  X,
  FilePlus,
  BookOpen,
  Compass,
  Send,
  MessageCircle,
  CheckCircle2,
  Filter,
  UserCheck,
  Lock,
  Copy,
  Sparkles,
  ExternalLink,
  Layers,
  ArrowRight,
  RotateCcw,
  Check,
  Square,
  CheckSquare,
  Building2,
} from 'lucide-react';
import { formatPhone, cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CustomerFormModal } from '@/components/customers/customer-form-modal';
import { getCurrentUser } from '@/lib/auth';
import { openWhatsApp } from '@/lib/whatsapp';
import { Customer } from '@/types';

// Pre-made professional broadcast message templates for Architects
const BROADCAST_TEMPLATES = [
  {
    id: 'catalog_launch',
    title: '📁 2026 Laminate & Louver Catalogue',
    desc: 'Invite architects to review latest swatches and sample folders',
    message:
      'Dear {architect_name},\n\nGreetings from Showhouse Decor Studio! 🌟\n\nWe are pleased to introduce our exclusive *New 2026 Collection* of High-Gloss Acrylic Laminates, Fluted Louvers, and Natural Veneer finishes crafted for premium interior projects.\n\nWe would be honored to deliver physical sample folders and catalogs directly to your studio or project site.\n\nPlease let us know a convenient time for sample delivery.\n\nWarm regards,\nShowhouse Concept & Design LLP\nThane (W) | +91 93248 69306',
  },
  {
    id: 'trade_discount',
    title: '🏷️ Architect Trade Rates & Priority Dispatch',
    desc: 'Share special commission and rate contract matrix',
    message:
      'Hello {architect_name},\n\nHope your ongoing interior projects are shaping up wonderfully.\n\nShowhouse Decor Studio has rolled out revised *Architect Trade Discounts & Priority Dispatch* for all your residential and commercial sites. Enjoy pre-agreed contract pricing, immediate dispatch from our Thane depot, and zero material delays.\n\nFeel free to share your project BOQs for instant rate confirmation.\n\nRegards,\nShowhouse Decor Studio\n+91 93248 69306',
  },
  {
    id: 'site_visit',
    title: '🏢 Site Visit & Sample Kit Delivery',
    desc: 'Offer on-site client assistance and sample presentation',
    message:
      'Hi {architect_name},\n\nOur design consultant from Showhouse Decor Studio is available in your area this week for *On-Site Material Sampling* and client consultation.\n\nIf you have any active site needing laminate, veneer, or wallpaper selection, reply to this message and we will dispatch our team with physical swatch kits.\n\nBest regards,\nShowhouse Decor Studio\n+91 93248 69306',
  },
  {
    id: 'custom',
    title: '✍️ Custom Announcement Message',
    desc: 'Compose a custom broadcast announcement',
    message:
      'Hello {architect_name},\n\nGreetings from Showhouse Decor Studio!\n\nWe wanted to share an exciting update regarding our latest architectural materials and services for your interior projects.\n\nReach out to us anytime for samples, rates, and priority deliveries.\n\nShowhouse Concept & Design LLP\n+91 93248 69306',
  },
];

export default function CustomersPage() {
  const { customers, deleteCustomer, getCustomerChallans, showToast } = useApp();
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Filters & Tabs
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'architects' | 'clients'>('all');
  const [staffFilter, setStaffFilter] = useState('all');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // WhatsApp Broadcast Modal State
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('catalog_launch');
  const [broadcastMessage, setBroadcastMessage] = useState(BROADCAST_TEMPLATES[0].message);
  const [selectedArchitectIds, setSelectedArchitectIds] = useState<Set<string>>(new Set());
  const [sentArchitectIds, setSentArchitectIds] = useState<Set<string>>(new Set());
  const [broadcastQueueIndex, setBroadcastQueueIndex] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
    setCurrentUser(getCurrentUser());
  }, []);

  const isEmp = currentUser?.role === 'employee';

  // Helper to detect if a party is an Architect
  const isCustomerArchitect = useCallback((c: Customer) => {
    if (c.customer_type === 'architect' || c.is_architect === true) return true;
    const bName = (c.business_name || '').toLowerCase();
    const cName = (c.contact_person || '').toLowerCase();
    const notes = (c.notes || '').toLowerCase();
    return (
      bName.includes('arch') ||
      bName.includes('architect') ||
      bName.includes('design studio') ||
      cName.includes('arch') ||
      notes.includes('architect')
    );
  }, []);

  // 1. Strict Data Isolation:
  // - Employee ONLY sees customers created by their account
  // - Admin sees all customers, with optional Staff Filter
  const accessibleCustomers = useMemo(() => {
    if (!mounted) return customers;
    if (isEmp && currentUser) {
      const uName = (currentUser.name || '').toLowerCase().trim();
      const uUser = (currentUser.username || '').toLowerCase().trim();
      return customers.filter((c) => {
        const cr = (c.created_by || '').toLowerCase().trim();
        const crN = (c.creator_name || '').toLowerCase().trim();
        const uId = (c.user_id || '').toLowerCase().trim();
        return (
          (uUser && (cr === uUser || uId === uUser)) ||
          (uName && (cr.includes(uName) || crN.includes(uName) || uId.includes(uName)))
        );
      });
    }

    // Admin view: apply staffFilter if set
    if (staffFilter !== 'all') {
      const sLower = staffFilter.toLowerCase().trim();
      return customers.filter((c) => {
        const cr = (c.created_by || '').toLowerCase().trim();
        const crN = (c.creator_name || '').toLowerCase().trim();
        return cr === sLower || crN === sLower || crN.includes(sLower);
      });
    }

    return customers;
  }, [customers, mounted, isEmp, currentUser, staffFilter]);

  // Unique staff list for Admin segregation filter
  const staffMembersList = useMemo(() => {
    const defaultStaff = [
      'Vrushank',
      'Bhavin',
      'Neal',
      'Rishi',
      'Deepak',
      'Umang',
      'Kenil',
      'Ronak sir',
      'Admin SH',
    ];
    const customerCreators = customers
      .map((c) => c.creator_name || c.created_by)
      .filter(Boolean) as string[];
    const combined = Array.from(new Set([...defaultStaff, ...customerCreators]));
    return combined.sort();
  }, [customers]);

  // Architect and Client subsets
  const allArchitects = useMemo(() => {
    return accessibleCustomers.filter(isCustomerArchitect);
  }, [accessibleCustomers, isCustomerArchitect]);

  const allClients = useMemo(() => {
    return accessibleCustomers.filter((c) => !isCustomerArchitect(c));
  }, [accessibleCustomers, isCustomerArchitect]);

  // Tab & Search Filtered List
  const displayCustomers = useMemo(() => {
    let list = accessibleCustomers;

    if (activeTab === 'architects') {
      list = allArchitects;
    } else if (activeTab === 'clients') {
      list = allClients;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.business_name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.contact_person && c.contact_person.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.architect_firm && c.architect_firm.toLowerCase().includes(q)) ||
          (c.delivery_address && c.delivery_address.toLowerCase().includes(q))
      );
    }

    return list;
  }, [accessibleCustomers, activeTab, allArchitects, allClients, search]);

  // Initialize selected architect IDs when modal opens
  const handleOpenBroadcastModal = () => {
    const validArchIds = allArchitects
      .filter((a) => Boolean(a.phone && a.phone.replace(/[^0-9]/g, '').length >= 10))
      .map((a) => a.id);
    setSelectedArchitectIds(new Set(validArchIds));
    setSentArchitectIds(new Set());
    setBroadcastQueueIndex(0);
    setShowBroadcastModal(true);
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = BROADCAST_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setBroadcastMessage(tmpl.message);
    }
  };

  const toggleSelectArchitect = (id: string) => {
    setSelectedArchitectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllArchitects = () => {
    if (selectedArchitectIds.size === allArchitects.length) {
      setSelectedArchitectIds(new Set());
    } else {
      setSelectedArchitectIds(new Set(allArchitects.map((a) => a.id)));
    }
  };

  // 1-Click Send to Single Architect
  const handleSendToArchitect = (architect: Customer) => {
    if (!architect.phone) {
      showToast('Architect does not have a valid mobile number', 'error');
      return;
    }
    const cleanPhone = architect.phone.replace(/[^0-9]/g, '');
    const archName = architect.contact_person || architect.business_name || 'Architect';
    const finalMsg = broadcastMessage.replace(/\{architect_name\}/g, archName);

    openWhatsApp(cleanPhone, finalMsg);
    setSentArchitectIds((prev) => new Set(prev).add(architect.id));
    showToast(`WhatsApp opened for ${archName}!`, 'success');
  };

  // Sequential Queue Dispatcher: Sends to current in queue and advances
  const selectedArchitectsList = useMemo(() => {
    return allArchitects.filter((a) => selectedArchitectIds.has(a.id));
  }, [allArchitects, selectedArchitectIds]);

  const handleDispatchNextInQueue = () => {
    if (selectedArchitectsList.length === 0) {
      showToast('Please select at least one architect', 'error');
      return;
    }
    const current = selectedArchitectsList[broadcastQueueIndex] || selectedArchitectsList[0];
    if (!current) {
      showToast('All selected architects have been sent!', 'success');
      return;
    }

    handleSendToArchitect(current);

    if (broadcastQueueIndex < selectedArchitectsList.length - 1) {
      setBroadcastQueueIndex((prev) => prev + 1);
    } else {
      setBroadcastQueueIndex(0);
      showToast('Broadcast queue completed! 🎉', 'success');
    }
  };

  // Copy All Numbers for WhatsApp Web / Broadcast Group
  const handleCopyAllPhoneNumbers = () => {
    const phones = selectedArchitectsList
      .map((a) => a.phone?.replace(/[^0-9]/g, ''))
      .filter((p) => p && p.length >= 10);
    if (phones.length === 0) {
      showToast('No valid phone numbers found', 'error');
      return;
    }
    const joined = phones.join(', ');
    navigator.clipboard.writeText(joined);
    showToast(`Copied ${phones.length} WhatsApp numbers to clipboard!`, 'success');
  };

  const handleDelete = useCallback(() => {
    if (deleteId) {
      deleteCustomer(deleteId);
      showToast('Customer deleted', 'success');
      setDeleteId(null);
    }
  }, [deleteId, deleteCustomer, showToast]);

  return (
    <div className="space-y-4 pb-20 sm:pb-8 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-surface-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-surface-900 tracking-tight flex items-center gap-2">
              <span>Customer &amp; Architect Master</span>
            </h1>
            {isEmp ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <Lock size={11} />
                <span>My Client Records ({currentUser?.name || 'Staff'})</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                <CheckCircle2 size={11} />
                <span>Admin View (All Staff)</span>
              </span>
            )}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            {isEmp
              ? `Strict Data Isolation Active: Showing ${accessibleCustomers.length} clients added by your account.`
              : `Managing ${customers.length} total parties • ${allArchitects.length} Architects • ${allClients.length} Direct Clients.`}
          </p>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* WhatsApp Broadcast Button (Highlighted for Architects) */}
          <button
            type="button"
            onClick={handleOpenBroadcastModal}
            className="py-2 px-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Send 1-Click WhatsApp Broadcast to all architects"
          >
            <Send size={15} />
            <span>WhatsApp Broadcast</span>
            {allArchitects.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-white text-emerald-800 rounded-full text-[10px] font-black">
                {allArchitects.length}
              </span>
            )}
          </button>

          {/* Add New Customer / Architect Button */}
          <button
            type="button"
            className="btn-primary py-2 px-3.5 text-xs font-bold shadow-xs flex items-center gap-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white cursor-pointer active:scale-95"
            onClick={() => {
              setEditId(null);
              setShowForm(true);
            }}
          >
            <Plus size={16} />
            <span>+ Add Party / Architect</span>
          </button>
        </div>
      </div>

      {/* Segregation & Filter Toolbar */}
      <div className="card p-3 sm:p-4 bg-white border border-surface-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Bifurcation Tabs: All Parties | Architects Directory | Direct Clients */}
          <div className="flex items-center gap-1 bg-surface-100 p-1 rounded-xl shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={cn(
                'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
                activeTab === 'all'
                  ? 'bg-white text-surface-900 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              <Users size={14} className={activeTab === 'all' ? 'text-primary-600' : ''} />
              <span>All Parties ({accessibleCustomers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('architects')}
              className={cn(
                'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
                activeTab === 'architects'
                  ? 'bg-gradient-to-r from-purple-700 to-indigo-700 text-white shadow-xs'
                  : 'text-purple-700 hover:bg-purple-50'
              )}
            >
              <Compass size={14} className={activeTab === 'architects' ? 'text-amber-300' : 'text-purple-600'} />
              <span>Architects Directory ({allArchitects.length})</span>
              <span className={cn(
                "text-[9px] px-1.5 py-0.2 rounded-full font-black uppercase tracking-wider",
                activeTab === 'architects' ? "bg-amber-400 text-purple-950" : "bg-purple-100 text-purple-800"
              )}>
                VIP
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('clients')}
              className={cn(
                'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
                activeTab === 'clients'
                  ? 'bg-white text-surface-900 shadow-xs'
                  : 'text-surface-600 hover:text-surface-900'
              )}
            >
              <Building2 size={14} className={activeTab === 'clients' ? 'text-[#b8860b]' : ''} />
              <span>Direct Clients ({allClients.length})</span>
            </button>
          </div>

          {/* Search Bar & Staff Filter */}
          <div className="flex items-center gap-2 flex-1 max-w-xl">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
              <input
                type="text"
                placeholder={
                  activeTab === 'architects'
                    ? 'Search architects by studio, contact, phone...'
                    : 'Search customers by name, phone, or address...'
                }
                className="input pl-9 pr-8 text-xs py-1.5 w-full font-medium"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 p-0.5"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Admin Staff Filter Dropdown (Role Protected) */}
            {!isEmp && (
              <div className="flex items-center gap-1.5 shrink-0">
                <UserCheck size={14} className="text-primary-600 hidden sm:inline" />
                <select
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  className="select text-xs py-1.5 font-bold text-surface-800 bg-surface-50 border-surface-300 rounded-lg max-w-[170px]"
                  title="Filter customers added by specific staff employee"
                >
                  <option value="all">All Staff Members</option>
                  {staffMembersList.map((staff) => (
                    <option key={staff} value={staff}>
                      {staff}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Architect Banner in Architects Directory Tab */}
        {activeTab === 'architects' && (
          <div className="p-3 bg-gradient-to-r from-purple-50 via-indigo-50/50 to-purple-50 rounded-xl border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-600 text-white rounded-lg shrink-0">
                <Compass size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                  <span>Showhouse Architect Network</span>
                  <span className="text-[10px] bg-purple-200/70 text-purple-800 px-1.5 py-0.2 rounded font-black">
                    {allArchitects.length} Studios Registered
                  </span>
                </h4>
                <p className="text-[11px] text-purple-800/80 mt-0.5">
                  Send catalogue updates, new finish collections, and trade rate matrices with 1-Click WhatsApp Broadcast.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenBroadcastModal}
              className="py-1.5 px-3 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Send size={13} />
              <span>Launch Architect Broadcast</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-2.5">
        {displayCustomers.length === 0 ? (
          <div className="card p-8 text-center bg-white border border-dashed border-surface-300 space-y-2">
            <Users className="w-10 h-10 mx-auto text-surface-400" />
            <p className="text-sm font-bold text-surface-800">No parties found</p>
            <p className="text-xs text-surface-400">
              {isEmp
                ? 'You have not added any parties yet. Click "+ Add Party" to register your clients.'
                : 'No records match your search or staff filter.'}
            </p>
          </div>
        ) : (
          displayCustomers.map((c) => {
            const isArch = isCustomerArchitect(c);
            const totalChallans = getCustomerChallans(c.id).length;
            const ratesCount = Array.isArray(c.material_rates) ? c.material_rates.length : 0;

            return (
              <div
                key={c.id}
                className={cn(
                  'card p-3.5 shadow-xs space-y-2.5 border transition-colors bg-white',
                  isArch ? 'border-purple-200 hover:border-purple-300' : 'hover:border-surface-300'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/customers/${c.id}`} className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-extrabold text-xs text-surface-900">{c.business_name}</h3>
                      {isArch && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                          <Compass size={10} />
                          <span>ARCHITECT</span>
                        </span>
                      )}
                    </div>
                    {c.contact_person && (
                      <p className="text-[11px] text-surface-500 mt-0.5">
                        {isArch ? `Lead: ${c.contact_person}` : c.contact_person}
                      </p>
                    )}
                  </Link>

                  <div className="flex items-center gap-1">
                    {c.phone && (
                      <button
                        type="button"
                        onClick={() => openWhatsApp(c.phone, `Hello ${c.contact_person || c.business_name}, greetings from Showhouse Decor Studio!`)}
                        className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md border border-emerald-200 cursor-pointer"
                        title="Chat on WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </button>
                    )}
                    <Link
                      href={`/ledger?customerId=${encodeURIComponent(c.id)}&rebuild=true`}
                      className="p-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-md border border-amber-200 flex items-center gap-1 text-[11px] font-bold"
                      title="View Customer Ledger"
                    >
                      <BookOpen size={13} />
                      <span>Ledger ({totalChallans})</span>
                    </Link>
                    <Link
                      href={`/challans/new?customerId=${c.id}`}
                      className="p-1.5 bg-primary-50 text-primary-600 rounded-md hover:bg-primary-100"
                      title="New Delivery Challan"
                    >
                      <FilePlus size={14} />
                    </Link>
                    <button
                      className="p-1.5 bg-surface-100 text-surface-700 rounded-md hover:bg-surface-200 cursor-pointer"
                      onClick={() => {
                        setEditId(c.id);
                        setShowForm(true);
                      }}
                      title="Edit"
                    >
                      <Edit size={14} />
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-surface-100 text-xs space-y-1">
                  {c.phone && (
                    <div className="flex items-center gap-1.5 text-surface-700 text-[11px]">
                      <Phone size={12} className="text-surface-400" />
                      <a href={`tel:${c.phone}`} className="hover:text-primary-600 font-bold">
                        {formatPhone(c.phone)}
                      </a>
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-1.5 text-surface-500 text-[11px] truncate">
                      <Mail size={12} className="text-surface-400 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  {(c.delivery_address || c.billing_address) && (
                    <div className="flex items-center gap-1.5 text-surface-500 text-[11px] truncate">
                      <MapPin size={12} className="text-surface-400 shrink-0" />
                      <span className="truncate">{c.delivery_address || c.billing_address}</span>
                    </div>
                  )}
                  {c.creator_name && (
                    <div className="text-[10px] text-surface-400 pt-0.5">
                      Added by: <strong>{c.creator_name}</strong>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table View */}
      <div className="card hidden md:block overflow-hidden shadow-xs bg-white border border-surface-200">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr className="bg-surface-50 text-[10px] font-bold uppercase tracking-wider text-surface-600 border-b border-surface-200">
                <th>Party / Studio</th>
                <th>Type</th>
                <th>Contact Person</th>
                <th>Phone / WhatsApp</th>
                <th>Studio / Site Address</th>
                <th>Added By</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {displayCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-xs text-surface-400 space-y-1">
                    <p className="font-bold text-surface-700">No parties found</p>
                    <p className="text-[11px]">
                      {isEmp
                        ? 'You have not added any parties yet. Click "+ Add Party" above.'
                        : 'Try searching with another keyword or resetting the staff filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                displayCustomers.map((c) => {
                  const isArch = isCustomerArchitect(c);
                  const totalChallans = getCustomerChallans(c.id).length;
                  const ratesCount = Array.isArray(c.material_rates) ? c.material_rates.length : 0;

                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        'hover:bg-surface-50/80 transition-colors',
                        isArch && 'bg-purple-50/15'
                      )}
                    >
                      {/* Name & Studio */}
                      <td>
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-extrabold text-xs text-surface-900 hover:text-primary-600 flex items-center gap-1.5"
                        >
                          <span>{c.business_name}</span>
                        </Link>
                        {c.email && (
                          <div className="text-[10px] text-surface-400 mt-0.5 flex items-center gap-1">
                            <Mail size={10} />
                            <span>{c.email}</span>
                          </div>
                        )}
                      </td>

                      {/* Type Badge */}
                      <td>
                        {isArch ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-200 shadow-2xs">
                            <Compass size={11} className="text-purple-700" />
                            <span>ARCHITECT</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-100 text-surface-700">
                            <span>CLIENT</span>
                          </span>
                        )}
                      </td>

                      {/* Contact */}
                      <td className="text-xs text-surface-700 font-semibold">
                        {c.contact_person || '—'}
                      </td>

                      {/* Phone / WhatsApp */}
                      <td className="text-xs text-surface-700 whitespace-nowrap">
                        {c.phone ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${c.phone}`}
                              className="hover:text-primary-600 font-bold"
                            >
                              {formatPhone(c.phone)}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                openWhatsApp(
                                  c.phone,
                                  `Hello ${c.contact_person || c.business_name}, greetings from Showhouse Decor Studio!`
                                )
                              }
                              className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle size={13} />
                            </button>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Address */}
                      <td className="text-xs text-surface-500 max-w-xs truncate" title={c.delivery_address || c.billing_address || ''}>
                        {c.delivery_address || c.billing_address || '—'}
                      </td>

                      {/* Added by */}
                      <td className="text-[11px] text-surface-600 whitespace-nowrap">
                        {c.creator_name || c.created_by ? (
                          <span className="px-2 py-0.5 rounded bg-surface-100 text-surface-700 font-bold border border-surface-200">
                            {c.creator_name || c.created_by}
                          </span>
                        ) : (
                          <span className="text-surface-400">Admin</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* 1-Click Ledger */}
                          <Link
                            href={`/ledger?customerId=${encodeURIComponent(c.id)}&rebuild=true`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md transition-colors shadow-2xs mr-1"
                            title="1-Click: Generate / View Party Ledger with All Delivery Challans"
                          >
                            <BookOpen size={12} className="text-amber-700" />
                            <span>Ledger ({totalChallans})</span>
                          </Link>

                          {/* New Challan */}
                          <Link
                            href={`/challans/new?customerId=${c.id}`}
                            className="p-1.5 text-primary-600 hover:bg-primary-50 rounded"
                            title="New Challan for Party"
                          >
                            <FilePlus size={15} />
                          </Link>

                          {/* View Profile */}
                          <Link
                            href={`/customers/${c.id}`}
                            className="p-1.5 text-surface-500 hover:text-primary-600 rounded"
                            title="View Customer Profile"
                          >
                            <Eye size={15} />
                          </Link>

                          {/* Edit Profile */}
                          <button
                            type="button"
                            className="p-1.5 text-surface-500 hover:text-surface-800 rounded cursor-pointer"
                            onClick={() => {
                              setEditId(c.id);
                              setShowForm(true);
                            }}
                            title="Edit Details"
                          >
                            <Edit size={15} />
                          </button>

                          {/* Delete (Admin only) */}
                          {!isEmp && (
                            <button
                              type="button"
                              className="p-1.5 text-surface-400 hover:text-red-500 rounded cursor-pointer"
                              onClick={() => setDeleteId(c.id)}
                              title="Delete Record"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL: 1-CLICK WHATSAPP BROADCAST FOR ARCHITECTS             */}
      {/* ============================================================ */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-surface-200 p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-surface-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-xs">
                  <Send size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-surface-900 flex items-center gap-2">
                    <span>WhatsApp Broadcast to Architects</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800">
                      {selectedArchitectsList.length} Selected
                    </span>
                  </h3>
                  <p className="text-[11px] text-surface-500">
                    Send catalogue releases, trade discounts, and project greetings directly via WhatsApp.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="p-1.5 text-surface-400 hover:text-surface-700 rounded-lg hover:bg-surface-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Template Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-surface-700 flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#ea580c]" />
                <span>Select Broadcast Template Preset</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {BROADCAST_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl.id)}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition-all cursor-pointer',
                      selectedTemplateId === tmpl.id
                        ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-200'
                        : 'border-surface-200 hover:border-surface-300 bg-surface-50/50'
                    )}
                  >
                    <div className="font-bold text-xs text-surface-900 flex items-center justify-between">
                      <span>{tmpl.title}</span>
                      {selectedTemplateId === tmpl.id && (
                        <Check size={14} className="text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <div className="text-[10px] text-surface-500 mt-0.5 leading-snug">
                      {tmpl.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Broadcast Message Composer */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-surface-700">
                  Broadcast Message Content
                </label>
                <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Tag <code>{`{architect_name}`}</code> is auto-personalized
                </span>
              </div>
              <textarea
                rows={6}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="input w-full text-xs font-mono p-3 leading-relaxed"
                placeholder="Type your WhatsApp broadcast message..."
              />
            </div>

            {/* Architect Recipients Selection */}
            <div className="space-y-2 pt-2 border-t border-surface-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAllArchitects}
                    className="flex items-center gap-1.5 text-xs font-bold text-surface-800 cursor-pointer"
                  >
                    {selectedArchitectIds.size === allArchitects.length ? (
                      <CheckSquare size={16} className="text-emerald-600" />
                    ) : (
                      <Square size={16} className="text-surface-400" />
                    )}
                    <span>Select All Architects ({allArchitects.length})</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAllPhoneNumbers}
                    className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                    title="Copy all mobile numbers to clipboard"
                  >
                    <Copy size={12} />
                    <span>Copy All Numbers</span>
                  </button>
                </div>
              </div>

              {/* Architect List Scroll */}
              <div className="border border-surface-200 rounded-xl divide-y divide-surface-100 max-h-48 overflow-y-auto">
                {allArchitects.length === 0 ? (
                  <div className="p-4 text-center text-xs text-surface-400">
                    No architects found. Add an architect to send broadcasts.
                  </div>
                ) : (
                  allArchitects.map((arch, idx) => {
                    const isSelected = selectedArchitectIds.has(arch.id);
                    const isSent = sentArchitectIds.has(arch.id);
                    const cleanPhone = arch.phone?.replace(/[^0-9]/g, '');
                    const isCurrentInQueue = selectedArchitectsList[broadcastQueueIndex]?.id === arch.id;

                    return (
                      <div
                        key={arch.id}
                        className={cn(
                          'p-2.5 flex items-center justify-between gap-2 text-xs transition-colors',
                          isCurrentInQueue && 'bg-amber-50/50',
                          isSent && 'bg-emerald-50/30'
                        )}
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectArchitect(arch.id)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-400 cursor-pointer"
                          />
                          <div className="truncate">
                            <div className="font-bold text-surface-900 flex items-center gap-1.5">
                              <span className="truncate">{arch.business_name}</span>
                              {arch.contact_person && (
                                <span className="text-surface-500 font-normal truncate">
                                  ({arch.contact_person})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-surface-500 flex items-center gap-1">
                              <Phone size={10} />
                              <span>{formatPhone(arch.phone)}</span>
                            </div>
                          </div>
                        </label>

                        {/* Individual Send Button */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isSent && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 size={11} />
                              <span>Sent</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSendToArchitect(arch)}
                            disabled={!cleanPhone || cleanPhone.length < 10}
                            className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                            title="Open WhatsApp chat with prefilled personalized message"
                          >
                            <Send size={11} />
                            <span>Send</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Broadcast Action Toolbar */}
            <div className="pt-3 border-t border-surface-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-[11px] text-surface-500">
                {sentArchitectIds.size > 0 ? (
                  <span>
                    Sent to <strong>{sentArchitectIds.size}</strong> of {selectedArchitectsList.length} architects.
                  </span>
                ) : (
                  <span>Ready to broadcast to {selectedArchitectsList.length} selected architects.</span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="btn-secondary py-2 px-3 text-xs flex-1 sm:flex-initial"
                >
                  Close
                </button>

                {/* 1-Click Sequential Broadcast Dispatcher */}
                <button
                  type="button"
                  onClick={handleDispatchNextInQueue}
                  disabled={selectedArchitectsList.length === 0}
                  className="btn-primary py-2 px-4 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 flex-1 sm:flex-initial"
                >
                  <Send size={14} />
                  <span>
                    Send Next in Queue ({broadcastQueueIndex + 1}/{selectedArchitectsList.length})
                  </span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal for Add/Edit Customer or Architect */}
      {showForm && (
        <CustomerFormModal
          editId={editId}
          onClose={() => {
            setShowForm(false);
            setEditId(null);
          }}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Customer / Architect"
        message="Are you sure you want to delete this record? Past challans and ledger vouchers will still be retained."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
