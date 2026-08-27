import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Trash2, Edit2, X, Send, Film,
  RefreshCw, ToggleLeft, ToggleRight, Clock, Users, User, Repeat, Calendar,
  Video, UploadCloud, Eye, ChevronLeft, ChevronRight
} from 'lucide-react';
import axios from 'axios';

const API = '/api';

// AI features (caption improve/rewrite/etc.) are built but hidden from the UI
// until OpenRouter usage is funded. Flip to true to re-show the toolbar.
const AI_FEATURES_ENABLED = false;

// Targeting is temporarily scoped to Groups/Group Lists/Audience Lists only. Contacts,
// Contact Lists, and WhatsApp Status are built and working but hidden from the destination
// picker for now. Flip these back to true to re-show their tabs.
const CONTACTS_FEATURES_ENABLED = false;
const WHATSAPP_STATUS_ENABLED = false;

// ─── Types ───────────────────────────────────────────────────────────────────
interface MediaFile { path: string; type: 'image' | 'video'; }
interface Group { id: string; name: string; isGroup: boolean; }
interface Announcement {
  id: number;
  title: string;
  caption: string;
  caption_variations: string; // JSON string array
  caption_index: number;
  media_files: string; // JSON
  is_recurring: number;
  recurrence_days: number | null;
  recurrence_days_of_week: string; // JSON
  post_time: string;
  target_groups: string; // JSON
  target_contacts?: string; // JSON
  target_contact_lists?: string; // JSON
  target_group_lists?: string; // JSON
  target_audience_lists?: string; // JSON
  include_status?: number;
  ribbon_index: number;
  status: 'active' | 'inactive';
  next_post_at: string | null;
  created_at: string;
  sender_jid: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const parseJSON = <T,>(str: string, fallback: T): T => {
  try { return JSON.parse(str); } catch { return fallback; }
};

const formatNextPost = (dt: string | null) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const DAYS_OF_WEEK = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

// ─── Media Ribbon Strip (card preview) ───────────────────────────────────────
const RibbonStrip = ({ files, ribbonIndex }: { files: MediaFile[]; ribbonIndex: number }) => {
  if (files.length === 0) {
    return (
      <div className="w-full h-32 rounded-lg bg-slate-800/60 flex items-center justify-center text-slate-600">
        <Film size={28} />
      </div>
    );
  }
  const current = files[ribbonIndex % files.length];
  return (
    <div className="relative w-full h-32 rounded-lg overflow-hidden bg-slate-950/40">
      {current.type === 'image' ? (
        <img src={`/${current.path}`} className="w-full h-full object-contain" alt="" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-700/50">
          <Video size={32} className="text-indigo-400" />
        </div>
      )}
      {files.length > 1 && (
        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-full">
          {ribbonIndex + 1}/{files.length}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const Announcements = ({ openNewModalOnMount, setOpenNewModalOnMount }: { openNewModalOnMount?: boolean; setOpenNewModalOnMount?: (val: boolean) => void }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [postingId, setPostingId] = useState<number | null>(null);
  const [previewAnn, setPreviewAnn] = useState<Announcement | null>(null);
  const [previewMediaIndex, setPreviewMediaIndex] = useState<number>(0);
  const [sessions, setSessions] = useState<any[]>([]);

  const defaultForm = {
    title: '',
    caption: '',
    caption_variations: [] as string[],
    is_recurring: false,
    recurrence_days: 7,
    recurrence_days_of_week: [] as number[],
    start_date: new Date().toISOString().slice(0, 10),
    post_time: '08:00',
    next_post_at: '',
    target_groups: [] as string[],
    target_contacts: [] as number[],
    target_contact_lists: [] as number[],
    target_group_lists: [] as number[],
    target_audience_lists: [] as number[],
    include_status: false,
    sender_jid: '',
  };
  const [form, setForm] = useState(defaultForm);
  const [destinationTab, setDestinationTab] = useState<'groups' | 'contacts' | 'contact_lists' | 'group_lists' | 'audience_lists' | 'status'>('groups');
  const [contactsList, setContactsList] = useState<any[]>([]);
  const [contactLists, setContactLists] = useState<any[]>([]);
  const [groupLists, setGroupLists] = useState<any[]>([]);
  const [audienceLists, setAudienceLists] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCredits, setAiCredits] = useState<{ remainingCredits: number; monthlyLimit: number; resetDate: string | null } | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);

  // New media files selected for upload
  const [newFiles, setNewFiles] = useState<File[]>([]);
  // Existing media files (when editing)
  const [existingMedia, setExistingMedia] = useState<MediaFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        f => f.type.startsWith('image/') || f.type.startsWith('video/')
      );
      if (droppedFiles.length > 0) {
        setNewFiles(prev => [...prev, ...droppedFiles]);
      }
    }
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  useEffect(() => {
    if (openNewModalOnMount && setOpenNewModalOnMount) {
      openModal();
      setOpenNewModalOnMount(false);
    }
  }, [openNewModalOnMount]);

  const fetchAnnouncements = async () => {
    try {
      const res = await axios.get(`${API}/announcements`);
      setAnnouncements(res.data);
    } catch (e) { console.error('Failed to fetch announcements', e); }
  };

  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${API}/whatsapp/status`);
      setSessions(res.data?.sessions || []);
    } catch {
      setSessions([]);
    }
  };

  const fetchGroups = async (senderJid?: any) => {
    const jid = (senderJid && typeof senderJid === 'string') ? senderJid : (form.sender_jid || '');
    try {
      setGroupsLoading(true);
      const res = await axios.get(`${API}/whatsapp/chats`, {
        params: jid ? { from: jid } : {}
      });
      setGroups(res.data);
    } catch {
      setGroups([]);
    } finally { setGroupsLoading(false); }
  };

  const fetchAudienceListsData = async () => {
    try {
      const res = await axios.get(`${API}/audience-lists`).catch(() => axios.get(`${API}/profiles`));
      setAudienceLists(res.data);
    } catch (e) {
      console.error('Failed to fetch audience lists', e);
    }
  };

  const fetchContactsData = async () => {
    try {
      const res = await axios.get(`${API}/contacts`);
      setContactsList(res.data);
    } catch { setContactsList([]); }
  };

  const fetchContactListsData = async () => {
    try {
      const res = await axios.get(`${API}/contact-lists`);
      setContactLists(res.data);
    } catch { setContactLists([]); }
  };

  const fetchGroupListsData = async () => {
    try {
      const res = await axios.get(`${API}/group-lists`);
      setGroupLists(res.data);
    } catch { setGroupLists([]); }
  };

  const fetchAICredits = async () => {
    try {
      const res = await axios.get(`${API}/ai/credits`);
      setAiCredits(res.data);
    } catch {}
  };

  const fetchUsageHistory = async () => {
    try {
      const res = await axios.get(`${API}/ai/usage-history`);
      setHistoryLogs(res.data);
      setShowHistoryModal(true);
    } catch {}
  };

  const handleAIProcess = async (operation: string, targetLanguage?: string) => {
    if (aiCredits && aiCredits.remainingCredits <= 0) {
      const resetStr = aiCredits.resetDate ? new Date(aiCredits.resetDate).toLocaleDateString() : 'next billing cycle';
      alert(`Insufficient AI credits remaining (0 credits available). Your credits will reset on ${resetStr}.`);
      return;
    }

    const textToProcess = (form.caption_variations && form.caption_variations.length > 0)
      ? form.caption_variations[0]
      : form.caption;

    if (!textToProcess || !textToProcess.trim()) {
      alert('Please enter a caption or message text first for AI processing.');
      return;
    }

    setAiLoading(true);
    try {
      const res = await axios.post(`${API}/ai/process`, {
        operation,
        text: textToProcess,
        targetLanguage,
        count: 3
      });

      if (res.data.remainingCredits !== undefined) {
        setAiCredits(prev => ({
          remainingCredits: res.data.remainingCredits,
          monthlyLimit: prev?.monthlyLimit || 50,
          resetDate: res.data.resetDate || prev?.resetDate || null
        }));
      }

      if (operation === 'generate_variations') {
        const vars = Array.isArray(res.data.result) ? res.data.result : [res.data.result];
        setForm(prev => ({
          ...prev,
          caption_variations: vars
        }));
      } else {
        const textResult = res.data.result;
        setForm(prev => ({
          ...prev,
          caption: textResult,
          caption_variations: prev.caption_variations && prev.caption_variations.length > 0
            ? [textResult, ...prev.caption_variations.slice(1)]
            : []
        }));
      }
    } catch (err: any) {
      alert('AI processing error: ' + (err.response?.data?.error || err.message));
    } finally {
      setAiLoading(false);
    }
  };

  const openModal = async (ann?: Announcement) => {
    await fetchSessions();
    fetchAudienceListsData();
    fetchContactsData();
    fetchContactListsData();
    fetchGroupListsData();
    fetchAICredits();
    if (ann) {
      setEditingId(ann.id);
      setForm({
        title: ann.title,
        caption: ann.caption || '',
        caption_variations: parseJSON<string[]>(ann.caption_variations || '[]', []),
        is_recurring: !!ann.is_recurring,
        recurrence_days: ann.recurrence_days || 7,
        recurrence_days_of_week: parseJSON<number[]>(ann.recurrence_days_of_week || '[]', []),
        start_date: ann.next_post_at ? ann.next_post_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
        post_time: ann.post_time || '08:00',
        next_post_at: ann.next_post_at ? ann.next_post_at.slice(0, 16) : '',
        target_groups: parseJSON<string[]>(ann.target_groups, []),
        target_contacts: parseJSON<number[]>(ann.target_contacts || '[]', []),
        target_contact_lists: parseJSON<number[]>(ann.target_contact_lists || '[]', []),
        target_group_lists: parseJSON<number[]>(ann.target_group_lists || '[]', []),
        target_audience_lists: parseJSON<number[]>(ann.target_audience_lists || '[]', []),
        include_status: Boolean(ann.include_status),
        sender_jid: ann.sender_jid || '',
      });
      setExistingMedia(parseJSON<MediaFile[]>(ann.media_files, []));
      fetchGroups(ann.sender_jid || '');
    } else {
      setEditingId(null);
      setForm(defaultForm);
      setExistingMedia([]);
      fetchGroups('');
    }
    setNewFiles([]);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setNewFiles([]);
    setExistingMedia([]);
    setForm(defaultForm);
    setGroupSearchTerm('');
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setNewFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    e.target.value = '';
  };

  const removeNewFile = (idx: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const removeExistingMedia = async (idx: number) => {
    if (!editingId) return;
    try {
      await axios.post(`${API}/announcements/${editingId}/delete-media`, { media_index: idx });
      setExistingMedia(prev => prev.filter((_, i) => i !== idx));
    } catch { alert('Failed to remove media file.'); }
  };

  const toggleGroup = (gid: string) => {
    setForm(prev => ({
      ...prev,
      target_groups: prev.target_groups.includes(gid)
        ? prev.target_groups.filter(g => g !== gid)
        : [...prev.target_groups, gid]
    }));
  };

  const toggleDayOfWeek = (dayId: number) => {
    setForm(prev => {
      const days = prev.recurrence_days_of_week || [];
      return {
        ...prev,
        recurrence_days_of_week: days.includes(dayId)
          ? days.filter(d => d !== dayId)
          : [...days, dayId].sort()
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title || !form.title.trim()) {
      alert('Please enter a title for this announcement.');
      titleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      titleInputRef.current?.focus();
      return;
    }

    const hasAnyTarget = form.target_groups.length > 0 ||
      form.target_contacts.length > 0 ||
      form.target_contact_lists.length > 0 ||
      form.target_group_lists.length > 0 ||
      form.target_audience_lists.length > 0 ||
      form.include_status;

    if (!hasAnyTarget) {
      alert('Please select at least one target destination (Groups, Contacts, Contact Lists, Group Lists, Audience Lists, or WhatsApp Status).');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('caption', form.caption);
      fd.append('caption_variations', JSON.stringify(form.caption_variations || []));
      fd.append('is_recurring', form.is_recurring ? '1' : '0');
      fd.append('post_time', form.post_time);
      fd.append('target_groups', JSON.stringify(form.target_groups));
      fd.append('target_contacts', JSON.stringify(form.target_contacts));
      fd.append('target_contact_lists', JSON.stringify(form.target_contact_lists));
      fd.append('target_group_lists', JSON.stringify(form.target_group_lists));
      fd.append('target_audience_lists', JSON.stringify(form.target_audience_lists));
      fd.append('include_status', form.include_status ? '1' : '0');
      fd.append('keep_media', '1'); // keep existing when editing
      fd.append('sender_jid', form.sender_jid || '');

      if (form.is_recurring) {
        const hasDays = form.recurrence_days_of_week && form.recurrence_days_of_week.length > 0;
        fd.append('recurrence_days', hasDays ? '' : String(form.recurrence_days));
        fd.append('recurrence_days_of_week', JSON.stringify(form.recurrence_days_of_week || []));

        // Calculate next_post_at: start_date (or today) + post_time
        let d = form.start_date ? new Date(form.start_date) : new Date();
        let h = 8, m = 0;
        const timeMatch = (form.post_time || '08:00').match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
        if (timeMatch) {
          h = parseInt(timeMatch[1], 10);
          m = parseInt(timeMatch[2], 10);
          const ampm = timeMatch[3];
          if (ampm) {
            if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
            if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
          }
        }
        d.setHours(h, m, 0, 0);

        if (hasDays) {
          // Find next closest matching day starting from 'd' (can be today if in future)
          for (let i = 0; i < 14; i++) {
            const checkDate = new Date(d);
            checkDate.setDate(checkDate.getDate() + i);
            if (form.recurrence_days_of_week.includes(checkDate.getDay())) {
              if (checkDate > new Date()) {
                d = checkDate;
                break;
              }
            }
          }
        } else {
          if (d <= new Date()) {
            d.setDate(d.getDate() + (form.recurrence_days || 1));
          }
        }
        fd.append('next_post_at', d.toISOString());
      } else {
        fd.append('recurrence_days', '');
        fd.append('recurrence_days_of_week', '[]');
        fd.append('next_post_at', form.next_post_at ? new Date(form.next_post_at).toISOString() : '');
      }

      for (const f of newFiles) fd.append('media_files', f);

      if (editingId) {
        await axios.put(`${API}/announcements/${editingId}`, fd);
      } else {
        await axios.post(`${API}/announcements`, fd);
      }
      closeModal();
      fetchAnnouncements();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || JSON.stringify(err);
      alert('Failed to save announcement: ' + errMsg);
    } finally { setSubmitting(false); }
  };

  const handleSaveAndPostNow = async () => {
    if (!form.title || !form.title.trim()) {
      alert('Please enter a title for this announcement.');
      titleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      titleInputRef.current?.focus();
      return;
    }

    const hasAnyTarget = form.target_groups.length > 0 ||
      form.target_contacts.length > 0 ||
      form.target_contact_lists.length > 0 ||
      form.target_group_lists.length > 0 ||
      form.target_audience_lists.length > 0 ||
      form.include_status;

    if (!hasAnyTarget) {
      alert('Please select at least one target destination (Groups, Contacts, Contact Lists, Group Lists, Audience Lists, or WhatsApp Status).');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('caption', form.caption);
      fd.append('caption_variations', JSON.stringify(form.caption_variations || []));
      fd.append('is_recurring', form.is_recurring ? '1' : '0');
      fd.append('post_time', form.post_time);
      fd.append('target_groups', JSON.stringify(form.target_groups));
      fd.append('target_contacts', JSON.stringify(form.target_contacts));
      fd.append('target_contact_lists', JSON.stringify(form.target_contact_lists));
      fd.append('target_group_lists', JSON.stringify(form.target_group_lists));
      fd.append('target_audience_lists', JSON.stringify(form.target_audience_lists));
      fd.append('include_status', form.include_status ? '1' : '0');
      fd.append('keep_media', '1');
      fd.append('sender_jid', form.sender_jid || '');

      if (form.is_recurring) {
        const hasDays = form.recurrence_days_of_week && form.recurrence_days_of_week.length > 0;
        fd.append('recurrence_days', hasDays ? '' : String(form.recurrence_days));
        fd.append('recurrence_days_of_week', JSON.stringify(form.recurrence_days_of_week || []));

        let d = form.start_date ? new Date(form.start_date) : new Date();
        let h = 8, m = 0;
        const timeMatch = (form.post_time || '08:00').match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
        if (timeMatch) {
          h = parseInt(timeMatch[1], 10);
          m = parseInt(timeMatch[2], 10);
          const ampm = timeMatch[3];
          if (ampm) {
            if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
            if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
          }
        }
        d.setHours(h, m, 0, 0);

        if (hasDays) {
          for (let i = 0; i < 14; i++) {
            const checkDate = new Date(d);
            checkDate.setDate(checkDate.getDate() + i);
            if (form.recurrence_days_of_week.includes(checkDate.getDay())) {
              if (checkDate > new Date()) {
                d = checkDate;
                break;
              }
            }
          }
        } else {
          if (d <= new Date()) {
            d.setDate(d.getDate() + (form.recurrence_days || 1));
          }
        }
        fd.append('next_post_at', d.toISOString());
      } else {
        fd.append('recurrence_days', '');
        fd.append('recurrence_days_of_week', '[]');
        fd.append('next_post_at', form.next_post_at ? new Date(form.next_post_at).toISOString() : '');
      }

      for (const f of newFiles) fd.append('media_files', f);

      let targetId = editingId;
      if (editingId) {
        await axios.put(`${API}/announcements/${editingId}`, fd);
      } else {
        const res = await axios.post(`${API}/announcements`, fd);
        targetId = res.data.id;
      }

      if (targetId) {
        await axios.post(`${API}/announcements/${targetId}/post-now`);
        alert('Announcement saved and posting initiated! Check Activity Logs for status.');
      }
      closeModal();
      fetchAnnouncements();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || JSON.stringify(err);
      alert('Failed to save and post announcement: ' + errMsg);
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this announcement?')) return;
    await axios.delete(`${API}/announcements/${id}`);
    fetchAnnouncements();
  };

  const handleToggleStatus = async (id: number) => {
    await axios.patch(`${API}/announcements/${id}/status`, {});
    fetchAnnouncements();
  };

  const handlePostNow = async (id: number) => {
    if (!window.confirm('Post this announcement to all target groups right now?')) return;
    setPostingId(id);
    try {
      await axios.post(`${API}/announcements/${id}/post-now`);
      alert('Post initiated! Check Activity Logs for status.');
    } catch { alert('Failed to initiate post.'); }
    finally { setPostingId(null); }
  };

  const openPreview = (ann: Announcement) => {
    setPreviewAnn(ann);
    setPreviewMediaIndex(0);
  };

  const closePreview = () => {
    setPreviewAnn(null);
  };

  const filtered = announcements.filter(a =>
    a.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            id="search-announcements"
            type="text"
            placeholder="Search announcements..."
            className="w-full pl-10 pr-4 py-2 glass-card bg-slate-900/30 border-slate-700/50 focus:border-primary outline-none transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          id="btn-add-announcement"
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all"
        >
          <Plus size={20} /> New Announcement
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map(ann => {
          const files = parseJSON<MediaFile[]>(ann.media_files, []);
          const grps = parseJSON<string[]>(ann.target_groups, []);
          return (
            <div key={ann.id} className={`glass-card p-0 group relative overflow-hidden flex flex-col ${ann.status === 'inactive' ? 'opacity-60' : ''}`}>
              {/* Media thumbnail ribbon */}
              <div className="relative">
                <RibbonStrip files={files} ribbonIndex={ann.ribbon_index} />
                {/* Status badge */}
                <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full ${ann.status === 'active' ? 'bg-emerald-500/80 text-white' : 'bg-slate-600/80 text-slate-300'}`}>
                  {ann.status}
                </div>
                {/* Recurring badge */}
                {!!ann.is_recurring && (
                  <div className="absolute top-2 right-2 bg-indigo-600/80 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Repeat size={10} /> Every {ann.recurrence_days}d
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <h4 className="font-bold text-white text-base leading-tight">{ann.title}</h4>
                {ann.caption && <p className="text-xs text-slate-400 line-clamp-2">{ann.caption}</p>}

                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Users size={11} /> {grps.length} group{grps.length !== 1 ? 's' : ''}
                  </span>
                  {files.length > 1 && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Film size={11} /> {files.length} media
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs text-slate-500 mt-auto pt-2 border-t border-slate-700/30">
                  <Clock size={11} />
                  <span>Next: {formatNextPost(ann.next_post_at)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="p-3 border-t border-slate-700/30 flex justify-between items-center">
                <button
                  onClick={() => handleToggleStatus(ann.id)}
                  className={`flex items-center gap-1 text-xs font-medium transition-colors ${ann.status === 'active' ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-slate-300'}`}
                  title="Toggle active/inactive"
                >
                  {ann.status === 'active' ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {ann.status === 'active' ? 'Active' : 'Inactive'}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePostNow(ann.id)}
                    disabled={postingId === ann.id}
                    title="Post Now"
                    className="p-2 text-green-400 hover:text-white hover:bg-green-500/20 rounded-lg transition-colors"
                  >
                    {postingId === ann.id ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                   <button onClick={() => openPreview(ann)} title="Preview Layout" className="p-2 text-indigo-400 hover:text-white hover:bg-indigo-500/20 rounded-lg transition-colors cursor-pointer">
                    <Eye size={15} />
                  </button>
                  <button onClick={() => openModal(ann)} title="Edit" className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => handleDelete(ann.id)} title="Delete" className="p-2 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-500 glass-card">
            <Megaphone size={40} className="mx-auto mb-3 opacity-30" />
            <p>No announcements yet. Click <strong>New Announcement</strong> to get started.</p>
          </div>
        )}
      </div>

      {/* ── Modal ────────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-slate-700/50 flex justify-between items-center sticky top-0 bg-slate-900/90 backdrop-blur-md z-10">
              <h3 className="text-xl font-bold text-white">
                {editingId ? 'Edit Announcement' : 'New Announcement'}
              </h3>
              <button onClick={closeModal} className="text-slate-500 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Title *</label>
                <input
                  ref={titleInputRef}
                  required type="text"
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none text-white"
                  placeholder="Announcement title"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </div>

              {/* Caption */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-400">Caption / Message</label>
                  <label className="flex items-center gap-2 text-xs text-indigo-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="accent-indigo-500 rounded"
                      checked={form.caption_variations && form.caption_variations.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm(prev => ({
                            ...prev,
                            caption_variations: prev.caption ? [prev.caption] : ['']
                          }));
                        } else {
                          setForm(prev => ({
                            ...prev,
                            caption_variations: []
                          }));
                        }
                      }}
                    />
                    Enable Text Variations (Round Robin)
                  </label>
                </div>

                {/* AI Assistant Toolbar & Credit System */}
                {AI_FEATURES_ENABLED && (
                <div className="bg-slate-900/60 border border-indigo-500/20 rounded-xl p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/40 pb-2">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      ✨ AI Assistant:
                    </span>
                    <div className="flex items-center gap-2">
                      {aiCredits && (
                        <div className="text-[11px] bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md text-slate-300 font-medium">
                          Remaining Credits: <strong className={aiCredits.remainingCredits > 0 ? 'text-emerald-400' : 'text-rose-400'}>{aiCredits.remainingCredits}</strong> / {aiCredits.monthlyLimit}
                          {aiCredits.resetDate && (
                            <span className="text-slate-500 ml-1.5">| Resets: {new Date(aiCredits.resetDate).toLocaleDateString()}</span>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={fetchUsageHistory}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                      >
                        Usage History
                      </button>
                    </div>
                  </div>

                  {aiLoading && (
                    <div className="text-xs text-indigo-400 flex items-center gap-1">
                      <RefreshCw size={12} className="animate-spin" /> Processing AI text...
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => handleAIProcess('improve')} disabled={aiLoading || (aiCredits?.remainingCredits === 0)} className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50">Improve</button>
                    <button type="button" onClick={() => handleAIProcess('rewrite')} disabled={aiLoading || (aiCredits?.remainingCredits === 0)} className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50">Rewrite</button>
                    <button type="button" onClick={() => handleAIProcess('grammar')} disabled={aiLoading || (aiCredits?.remainingCredits === 0)} className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50">Grammar</button>
                    <button type="button" onClick={() => handleAIProcess('expand')} disabled={aiLoading || (aiCredits?.remainingCredits === 0)} className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50">Expand</button>
                    <button type="button" onClick={() => handleAIProcess('shorten')} disabled={aiLoading || (aiCredits?.remainingCredits === 0)} className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50">Shorten</button>
                    <button type="button" onClick={() => handleAIProcess('generate_variations')} disabled={aiLoading || (aiCredits?.remainingCredits === 0)} className="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50">Generate Variations</button>
                  </div>
                </div>
                )}

                {form.caption_variations && form.caption_variations.length > 0 ? (
                  <div className="space-y-3 bg-slate-900/50 p-4 border border-slate-700/50 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-semibold">Text Variations List</span>
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, caption_variations: [...(prev.caption_variations || []), ''] }))}
                        className="text-xs px-2 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded border border-indigo-500/30 font-bold transition-all"
                      >
                        + Add Variation
                      </button>
                    </div>

                    {form.caption_variations.map((val, idx) => (
                      <div key={idx} className="flex gap-2 items-start relative group/var">
                        <textarea
                          required
                          className="flex-1 p-2 bg-slate-800 border border-slate-700 rounded-lg focus:border-indigo-500 outline-none text-sm text-white resize-y min-h-[50px]"
                          placeholder={`Variation #${idx + 1}`}
                          value={val}
                          onChange={e => {
                            const newVars = [...form.caption_variations];
                            newVars[idx] = e.target.value;
                            setForm(prev => ({ ...prev, caption_variations: newVars }));
                          }}
                        />
                        {form.caption_variations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newVars = form.caption_variations.filter((_, i) => i !== idx);
                              setForm(prev => ({ ...prev, caption_variations: newVars }));
                            }}
                            className="p-2 text-rose-500/70 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    <p className="text-[10px] text-slate-500">
                      When recurring is enabled, the sender cycles (round robin) through these variations on each post schedule.
                    </p>
                  </div>
                ) : (
                  <textarea
                    className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none resize-y min-h-[80px] text-white"
                    placeholder="Message text that will accompany the media..."
                    value={form.caption}
                    onChange={e => setForm({ ...form, caption: e.target.value })}
                  />
                )}
              </div>

              {/* ── Media Ribbon ─────────────────────────────────────────────── */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  <Film size={15} /> Media Ribbon (Images &amp; Videos) (Optional)
                </label>

                {/* Existing media (editing) */}
                {existingMedia.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500">Saved media (click × to remove):</p>
                    <div className="flex flex-wrap gap-2">
                      {existingMedia.map((f, i) => (
                        <div key={i} className="relative group/media w-16 h-16 rounded-lg overflow-hidden bg-slate-800 border border-slate-700">
                          {f.type === 'image'
                            ? <img src={`/${f.path}`} className="w-full h-full object-cover" alt="" />
                            : <div className="w-full h-full flex items-center justify-center"><Video size={20} className="text-indigo-400" /></div>
                          }
                          <button type="button" onClick={() => removeExistingMedia(i)}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover/media:opacity-100 flex items-center justify-center text-red-400 transition-opacity">
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New file previews */}
                {newFiles.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500">New files to upload:</p>
                    <div className="flex flex-wrap gap-2">
                      {newFiles.map((f, i) => {
                        const url = URL.createObjectURL(f);
                        const isVid = f.type.startsWith('video');
                        return (
                          <div key={i} className="relative group/nf w-16 h-16 rounded-lg overflow-hidden bg-slate-800 border border-slate-700">
                            {isVid
                              ? <div className="w-full h-full flex items-center justify-center"><Video size={20} className="text-indigo-400" /></div>
                              : <img src={url} className="w-full h-full object-cover" alt="" />
                            }
                            <button type="button" onClick={() => removeNewFile(i)}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover/nf:opacity-100 flex items-center justify-center text-red-400 transition-opacity">
                              <X size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-all cursor-pointer ${
                    isDragging
                      ? 'border-primary bg-primary/10 text-white'
                      : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-500 hover:bg-slate-800/60'
                  }`}
                >
                  <UploadCloud size={32} className={`mb-2 ${isDragging ? 'text-primary' : 'text-slate-500'}`} />
                  <p className="text-sm font-semibold text-center">
                    Drag &amp; drop images or videos here, or <span className="text-primary hover:underline">browse</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Supports PNG, JPG, JPEG, MP4, AVI, MKV, etc.</p>
                </div>
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*"
                  className="hidden" onChange={handleFileAdd} />
                <p className="text-xs text-slate-500">
                  For recurring posts, each file = one ribbon frame. They will rotate in order each time the post fires.
                </p>
              </div>

              {/* ── Post Type ────────────────────────────────────────────────── */}
              <div className="space-y-4">
                <label className="text-sm font-medium text-slate-400">Post Type</label>
                <div className="flex gap-3">
                  <button type="button" id="type-onetime"
                    onClick={() => setForm({ ...form, is_recurring: false })}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-sm border transition-all ${!form.is_recurring ? 'bg-primary border-primary text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                    <Calendar size={14} className="inline mr-1" /> One-Time
                  </button>
                  <button type="button" id="type-recurring"
                    onClick={() => setForm({ ...form, is_recurring: true })}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-sm border transition-all ${form.is_recurring ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                    <Repeat size={14} className="inline mr-1" /> Recurring
                  </button>
                </div>

                {/* One-time: date+time */}
                {!form.is_recurring && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400">Schedule Date &amp; Time</label>
                      <input type="datetime-local"
                        className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none text-white"
                        value={form.next_post_at}
                        onChange={e => setForm({ ...form, next_post_at: e.target.value })}
                      />
                    </div>
                  </div>
                )}
 
                 {/* Recurring: Options */}
                 {form.is_recurring && (
                   <div className="space-y-4 bg-slate-900/30 p-4 border border-slate-800 rounded-xl">
                     <div className="flex gap-2 p-1 bg-slate-800/80 rounded-lg border border-slate-700/50">
                       <button
                         type="button"
                         onClick={() => setForm(prev => ({ ...prev, recurrence_days_of_week: [] }))}
                         className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                           !(form.recurrence_days_of_week && form.recurrence_days_of_week.length > 0)
                             ? 'bg-primary text-white'
                             : 'text-slate-400 hover:text-slate-200'
                         }`}
                       >
                         Repeat by Interval
                       </button>
                       <button
                         type="button"
                         onClick={() => setForm(prev => ({ ...prev, recurrence_days_of_week: [1] }))}
                         className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                           form.recurrence_days_of_week && form.recurrence_days_of_week.length > 0
                             ? 'bg-primary text-white'
                             : 'text-slate-400 hover:text-slate-200'
                         }`}
                       >
                         Repeat by Days of Week
                       </button>
                     </div>
 
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       {/* Left side: recurrence rule */}
                       <div>
                        {form.recurrence_days_of_week && form.recurrence_days_of_week.length > 0 ? (
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-400">Select Days</label>
                            <div className="flex flex-wrap gap-1.5">
                              {DAYS_OF_WEEK.map(day => {
                                const active = form.recurrence_days_of_week.includes(day.id);
                                return (
                                  <button
                                    key={day.id}
                                    type="button"
                                    onClick={() => toggleDayOfWeek(day.id)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                      active
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow shadow-indigo-600/30'
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                                    }`}
                                  >
                                    {day.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-400">Every N days</label>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 text-sm">Every</span>
                              <input
                                type="number"
                                min={1}
                                max={365}
                                className="w-20 p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none text-white text-center"
                                value={form.recurrence_days}
                                onChange={e => setForm({ ...form, recurrence_days: parseInt(e.target.value) || 1 })}
                              />
                              <span className="text-slate-400 text-sm">days</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right side: Time of day */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-400">Time of day</label>
                        <input
                          type="time"
                          className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none text-white"
                          value={form.post_time}
                          onChange={e => setForm({ ...form, post_time: e.target.value })}
                        />
                      </div>

                      {/* Starting Date */}
                      <div className="col-span-2 space-y-2">
                        <label className="text-xs font-medium text-slate-400">Starting Date</label>
                        <input
                          type="date"
                          className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none text-white"
                          value={form.start_date || new Date().toISOString().slice(0, 10)}
                          onChange={e => setForm({ ...form, start_date: e.target.value })}
                        />
                        <p className="text-[10px] text-slate-500">
                          The schedule will start running on or after this date.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Sender Account ────────────────────────────────────────────── */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  <User size={15} /> Sender WhatsApp Account
                </label>
                <select
                  value={form.sender_jid || ''}
                  onChange={(e) => {
                    const newJid = e.target.value;
                    setForm({ ...form, sender_jid: newJid });
                    fetchGroups(newJid);
                  }}
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none text-white cursor-pointer"
                >
                  <option value="">Default (First Available Connected Account)</option>
                  {sessions.filter(s => s.status === 'CONNECTED').map(s => {
                    const digits = (s.jid || s.id || '').split('@')[0].split(':')[0];
                    return (
                      <option key={s.id} value={s.id}>
                        {digits ? `+${digits}` : s.id}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-slate-500">
                  Select which connected WhatsApp account will post this announcement. Changing this will reload the target groups below for that account.
                </p>
              </div>

              {/* ── Target Destinations (Groups, Contacts, Lists, Status) ────────────────────── */}
              <div className="space-y-4">
                <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <Users size={16} className="text-indigo-400" /> Target Destinations *
                </label>

                {/* Navigation Tabs */}
                <div className="flex flex-wrap gap-1 p-1 bg-slate-900/80 rounded-xl border border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setDestinationTab('groups')}
                    className={`flex-1 min-w-[90px] py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      destinationTab === 'groups' ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Groups ({form.target_groups.length})
                  </button>
                  {CONTACTS_FEATURES_ENABLED && (
                    <button
                      type="button"
                      onClick={() => setDestinationTab('contacts')}
                      className={`flex-1 min-w-[90px] py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        destinationTab === 'contacts' ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Contacts ({form.target_contacts.length})
                    </button>
                  )}
                  {CONTACTS_FEATURES_ENABLED && (
                    <button
                      type="button"
                      onClick={() => setDestinationTab('contact_lists')}
                      className={`flex-1 min-w-[90px] py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        destinationTab === 'contact_lists' ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Contact Lists ({form.target_contact_lists.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDestinationTab('group_lists')}
                    className={`flex-1 min-w-[90px] py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      destinationTab === 'group_lists' ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Group Lists ({form.target_group_lists.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestinationTab('audience_lists')}
                    className={`flex-1 min-w-[90px] py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      destinationTab === 'audience_lists' ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Audience ({form.target_audience_lists.length})
                  </button>
                  {WHATSAPP_STATUS_ENABLED && (
                    <button
                      type="button"
                      onClick={() => setDestinationTab('status')}
                      className={`flex-1 min-w-[90px] py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        destinationTab === 'status' ? 'bg-emerald-600 text-white shadow shadow-emerald-600/30' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      WA Status ({form.include_status ? 'ON' : 'OFF'})
                    </button>
                  )}
                </div>

                {/* Tab 1: Groups */}
                {destinationTab === 'groups' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Select WhatsApp Groups:</span>
                      <button type="button" onClick={fetchGroups} className="text-xs text-indigo-400 hover:underline flex items-center gap-1">
                        <RefreshCw size={12} className={groupsLoading ? 'animate-spin' : ''} /> Refresh Groups
                      </button>
                    </div>
                    {!groupsLoading && groups.length > 0 && (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                          type="text"
                          placeholder="Search groups..."
                          value={groupSearchTerm}
                          onChange={(e) => setGroupSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                        />
                      </div>
                    )}
                    <div className="max-h-44 overflow-y-auto space-y-1 bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
                      {groups
                        .filter(g => g.name.toLowerCase().includes(groupSearchTerm.toLowerCase()))
                        .map(g => (
                          <label key={g.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${form.target_groups.includes(g.id) ? 'bg-indigo-600/20 border border-indigo-500/30' : 'hover:bg-slate-800'}`}>
                            <input type="checkbox" className="accent-indigo-500" checked={form.target_groups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                            <span className="text-sm text-white">{g.name}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}

                {/* Tab 2: Contacts */}
                {destinationTab === 'contacts' && (
                  <div className="space-y-3">
                    <span className="text-xs text-slate-400">Select Individual Contacts:</span>
                    <div className="max-h-44 overflow-y-auto space-y-1 bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
                      {contactsList.map(c => (
                        <label key={c.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${form.target_contacts.includes(c.id) ? 'bg-indigo-600/20 border border-indigo-500/30' : 'hover:bg-slate-800'}`}>
                          <input
                            type="checkbox"
                            className="accent-indigo-500"
                            checked={form.target_contacts.includes(c.id)}
                            onChange={() => {
                              setForm(prev => ({
                                ...prev,
                                target_contacts: prev.target_contacts.includes(c.id)
                                  ? prev.target_contacts.filter(id => id !== c.id)
                                  : [...prev.target_contacts, c.id]
                              }));
                            }}
                          />
                          <div>
                            <div className="text-sm font-medium text-white">{c.name}</div>
                            <div className="text-xs text-slate-400">{c.phone_number}</div>
                          </div>
                        </label>
                      ))}
                      {contactsList.length === 0 && <p className="text-xs text-slate-500 p-2">No contacts saved yet. Add contacts in the Audience tab.</p>}
                    </div>
                  </div>
                )}

                {/* Tab 3: Contact Lists */}
                {destinationTab === 'contact_lists' && (
                  <div className="space-y-3">
                    <span className="text-xs text-slate-400">Select Contact Segment Lists:</span>
                    <div className="max-h-44 overflow-y-auto space-y-1 bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
                      {contactLists.map(cl => (
                        <label key={cl.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${form.target_contact_lists.includes(cl.id) ? 'bg-indigo-600/20 border border-indigo-500/30' : 'hover:bg-slate-800'}`}>
                          <input
                            type="checkbox"
                            className="accent-indigo-500"
                            checked={form.target_contact_lists.includes(cl.id)}
                            onChange={() => {
                              setForm(prev => ({
                                ...prev,
                                target_contact_lists: prev.target_contact_lists.includes(cl.id)
                                  ? prev.target_contact_lists.filter(id => id !== cl.id)
                                  : [...prev.target_contact_lists, cl.id]
                              }));
                            }}
                          />
                          <div>
                            <div className="text-sm font-medium text-white">{cl.name}</div>
                            {cl.description && <div className="text-xs text-slate-400">{cl.description}</div>}
                          </div>
                        </label>
                      ))}
                      {contactLists.length === 0 && <p className="text-xs text-slate-500 p-2">No contact lists saved yet.</p>}
                    </div>
                  </div>
                )}

                {/* Tab 4: Group Lists */}
                {destinationTab === 'group_lists' && (
                  <div className="space-y-3">
                    <span className="text-xs text-slate-400">Select Saved Group Lists:</span>
                    <div className="max-h-44 overflow-y-auto space-y-1 bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
                      {groupLists.map(gl => (
                        <label key={gl.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${form.target_group_lists.includes(gl.id) ? 'bg-indigo-600/20 border border-indigo-500/30' : 'hover:bg-slate-800'}`}>
                          <input
                            type="checkbox"
                            className="accent-indigo-500"
                            checked={form.target_group_lists.includes(gl.id)}
                            onChange={() => {
                              setForm(prev => ({
                                ...prev,
                                target_group_lists: prev.target_group_lists.includes(gl.id)
                                  ? prev.target_group_lists.filter(id => id !== gl.id)
                                  : [...prev.target_group_lists, gl.id]
                              }));
                            }}
                          />
                          <div>
                            <div className="text-sm font-medium text-white">{gl.name}</div>
                            {gl.description && <div className="text-xs text-slate-400">{gl.description}</div>}
                          </div>
                        </label>
                      ))}
                      {groupLists.length === 0 && <p className="text-xs text-slate-500 p-2">No group lists saved yet.</p>}
                    </div>
                  </div>
                )}

                {/* Tab 5: Audience Lists */}
                {destinationTab === 'audience_lists' && (
                  <div className="space-y-3">
                    <span className="text-xs text-slate-400">Select Combined Audience Lists:</span>
                    <div className="max-h-44 overflow-y-auto space-y-1 bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
                      {audienceLists.map(al => (
                        <label key={al.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${form.target_audience_lists.includes(al.id) ? 'bg-indigo-600/20 border border-indigo-500/30' : 'hover:bg-slate-800'}`}>
                          <input
                            type="checkbox"
                            className="accent-indigo-500"
                            checked={form.target_audience_lists.includes(al.id)}
                            onChange={() => {
                              setForm(prev => ({
                                ...prev,
                                target_audience_lists: prev.target_audience_lists.includes(al.id)
                                  ? prev.target_audience_lists.filter(id => id !== al.id)
                                  : [...prev.target_audience_lists, al.id]
                              }));
                            }}
                          />
                          <div>
                            <div className="text-sm font-medium text-white">{al.name}</div>
                            {al.description && <div className="text-xs text-slate-400">{al.description}</div>}
                          </div>
                        </label>
                      ))}
                      {audienceLists.length === 0 && <p className="text-xs text-slate-500 p-2">No audience lists saved yet.</p>}
                    </div>
                  </div>
                )}

                {/* Tab 5: WhatsApp Status */}
                {destinationTab === 'status' && (
                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-white">Broadcast to WhatsApp Status</div>
                        <div className="text-xs text-slate-400">Post this announcement directly as a WhatsApp Status update/story.</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={form.include_status}
                          onChange={e => setForm({ ...form, include_status: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-700/50 space-y-2">
                {/* While the request is in flight (which includes uploading any attached media),
                    the buttons below are disabled/greyed out — this line explains why so it
                    doesn't just look broken or unresponsive, especially for larger images/videos
                    that can take a few seconds over a slow connection. */}
                {submitting && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5 justify-end">
                    <RefreshCw size={12} className="animate-spin" />
                    {newFiles.length > 0
                      ? "Uploading your media — this can take a moment for large images or videos. Please don't close this window."
                      : 'Saving your announcement — please wait.'}
                  </p>
                )}
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={closeModal} disabled={submitting}
                    className="px-6 py-2 rounded-lg font-bold text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                    Cancel
                  </button>
                  <button type="button" onClick={handleSaveAndPostNow} disabled={submitting}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer">
                    {submitting && <RefreshCw size={16} className="animate-spin" />}
                    {submitting ? (newFiles.length > 0 ? 'Uploading...' : 'Posting...') : 'Post Now'}
                  </button>
                  <button type="submit" disabled={submitting}
                    className="px-6 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer">
                    {submitting && <RefreshCw size={16} className="animate-spin" />}
                    {submitting
                      ? (newFiles.length > 0 ? 'Uploading...' : 'Saving...')
                      : (editingId ? 'Save Changes' : 'Create Announcement')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Preview Modal (WhatsApp mockup) ─────────────────────────────────── */}
      {previewAnn && (() => {
        const files = parseJSON<MediaFile[]>(previewAnn.media_files, []);
        const media = files.length > 0 ? files[previewMediaIndex % files.length] : null;
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="p-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-900 flex-shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-white">Announcement Preview</h3>
                  {(() => {
                    const vars = parseJSON<string[]>(previewAnn.caption_variations || '[]', []);
                    return (
                      <p className="text-xs text-slate-400">
                        Mockup of how this appears on WhatsApp
                        {vars.length > 1 && ` (Text Variation: ${(previewAnn.caption_index % vars.length) + 1}/${vars.length})`}
                      </p>
                    );
                  })()}
                </div>
                <button onClick={closePreview} className="text-slate-500 hover:text-white cursor-pointer">
                  <X size={24} />
                </button>
              </div>

              {/* Chat Area Background */}
              <div className="flex-1 p-6 bg-slate-950/80 overflow-y-auto relative flex flex-col justify-start"
                   style={{
                     backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(0, 92, 75, 0.1) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(99, 102, 241, 0.05) 0%, transparent 40%)'
                   }}>
                
                {/* Simulated Chat bubble */}
                <div className="max-w-[85%] bg-[#005c4b] text-white rounded-xl rounded-tr-none p-2 shadow-lg relative ml-auto flex flex-col gap-1.5 border border-emerald-500/20">
                  {/* Media Content */}
                  {media && (
                    <div className="relative rounded-lg overflow-hidden bg-black/30 border border-emerald-600/30 max-h-64 flex items-center justify-center">
                      {media.type === 'image' ? (
                        <img src={`/${media.path}`} alt="" className="object-contain max-h-64 w-full" />
                      ) : (
                        <div className="relative w-full h-48 bg-slate-900/50 flex flex-col items-center justify-center">
                          <Video size={48} className="text-emerald-400 mb-2" />
                          <span className="text-xs text-slate-400">Video Attachment</span>
                        </div>
                      )}

                      {/* Carousel buttons */}
                      {files.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewMediaIndex(prev => (prev - 1 + files.length) % files.length);
                            }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white cursor-pointer transition-colors"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewMediaIndex(prev => (prev + 1) % files.length);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white cursor-pointer transition-colors"
                          >
                            <ChevronRight size={16} />
                          </button>
                          <span className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-[10px] text-white/90">
                            {previewMediaIndex + 1} / {files.length}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Caption Message */}
                  {(() => {
                    const vars = parseJSON<string[]>(previewAnn.caption_variations || '[]', []);
                    let captionText = previewAnn.caption || previewAnn.title;
                    if (vars.length > 0) {
                      captionText = vars[previewAnn.caption_index % vars.length];
                    }
                    return (
                      <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap px-1">
                        {captionText}
                      </p>
                    );
                  })()}

                  {/* Meta Time info */}
                  <div className="flex items-center gap-1 self-end text-[10px] text-emerald-300/80 font-medium select-none">
                    <span>
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-sky-300 font-bold">✓✓</span>
                  </div>
                </div>
              </div>

              {/* Close Footer */}
              <div className="p-4 border-t border-slate-700/50 bg-slate-900 flex justify-end flex-shrink-0">
                <button onClick={closePreview} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-all cursor-pointer">
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Usage History Modal ────────────────────────────────────────── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-900 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock size={18} className="text-indigo-400" /> AI Usage History
              </h3>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-500 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              {historyLogs.length > 0 ? (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40">
                  {historyLogs.map(log => (
                    <div key={log.id} className="p-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-white">{log.operation}</div>
                        <div className="text-[10px] text-slate-500">{new Date(log.createdAt).toLocaleString()}</div>
                      </div>
                      <span className="text-xs font-bold text-indigo-400 bg-indigo-600/20 border border-indigo-500/30 px-2 py-0.5 rounded">
                        -{log.creditsDeducted} Credit{log.creditsDeducted > 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-8">No AI credit usage history recorded yet.</p>
              )}
            </div>
            <div className="p-3 border-t border-slate-700/50 bg-slate-900 flex justify-end">
              <button onClick={() => setShowHistoryModal(false)} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold transition-all cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// placeholder icon used in the empty state
const Megaphone = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 11l19-9-9 19-2-8-8-2z" />
  </svg>
);

export default Announcements;
