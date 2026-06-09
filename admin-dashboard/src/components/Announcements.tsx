import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Trash2, Edit2, X, Send, Film,
  RefreshCw, ToggleLeft, ToggleRight, Clock, Users, Repeat, Calendar,
  Video, UploadCloud
} from 'lucide-react';
import axios from 'axios';

const API = '/api';

// ─── Types ───────────────────────────────────────────────────────────────────
interface MediaFile { path: string; type: 'image' | 'video'; }
interface Group { id: string; name: string; isGroup: boolean; }
interface Announcement {
  id: number;
  title: string;
  caption: string;
  media_files: string; // JSON
  is_recurring: number;
  recurrence_days: number | null;
  post_time: string;
  target_groups: string; // JSON
  ribbon_index: number;
  status: 'active' | 'inactive';
  next_post_at: string | null;
  created_at: string;
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

// ─── Media Ribbon Strip (card preview) ───────────────────────────────────────
const RibbonStrip = ({ files, ribbonIndex }: { files: MediaFile[]; ribbonIndex: number }) => {
  if (files.length === 0) {
    return (
      <div className="w-full h-24 rounded-lg bg-slate-800/60 flex items-center justify-center text-slate-600">
        <Film size={28} />
      </div>
    );
  }
  const current = files[ribbonIndex % files.length];
  return (
    <div className="relative w-full h-24 rounded-lg overflow-hidden bg-slate-800">
      {current.type === 'image' ? (
        <img src={`/${current.path}`} className="w-full h-full object-cover" alt="" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-700">
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
const Announcements = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [postingId, setPostingId] = useState<number | null>(null);

  const defaultForm = {
    title: '',
    caption: '',
    is_recurring: false,
    recurrence_days: 7,
    post_time: '08:00',
    next_post_at: '',
    target_groups: [] as string[],
  };
  const [form, setForm] = useState(defaultForm);

  // New media files selected for upload
  const [newFiles, setNewFiles] = useState<File[]>([]);
  // Existing media files (when editing)
  const [existingMedia, setExistingMedia] = useState<MediaFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const fetchAnnouncements = async () => {
    try {
      const res = await axios.get(`${API}/announcements`);
      setAnnouncements(res.data);
    } catch (e) { console.error('Failed to fetch announcements', e); }
  };

  const fetchGroups = async () => {
    try {
      setGroupsLoading(true);
      const res = await axios.get(`${API}/whatsapp/chats`);
      setGroups(res.data);
    } catch {
      setGroups([]);
    } finally { setGroupsLoading(false); }
  };

  const fetchProfiles = async () => {
    try {
      const res = await axios.get(`${API}/profiles`);
      setProfiles(res.data);
    } catch (e) {
      console.error('Failed to fetch profiles', e);
    }
  };

  const openModal = (ann?: Announcement) => {
    if (ann) {
      setEditingId(ann.id);
      setForm({
        title: ann.title,
        caption: ann.caption || '',
        is_recurring: !!ann.is_recurring,
        recurrence_days: ann.recurrence_days || 7,
        post_time: ann.post_time || '08:00',
        next_post_at: ann.next_post_at ? ann.next_post_at.slice(0, 16) : '',
        target_groups: parseJSON<string[]>(ann.target_groups, []),
      });
      setExistingMedia(parseJSON<MediaFile[]>(ann.media_files, []));
    } else {
      setEditingId(null);
      setForm(defaultForm);
      setExistingMedia([]);
    }
    setNewFiles([]);
    fetchGroups();
    fetchProfiles();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setNewFiles([]);
    setExistingMedia([]);
    setForm(defaultForm);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.target_groups.length === 0) {
      alert('Please select at least one target group.');
      return;
    }
    if (newFiles.length === 0 && existingMedia.length === 0) {
      alert('Please upload at least one image or video.');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('caption', form.caption);
      fd.append('is_recurring', form.is_recurring ? '1' : '0');
      fd.append('post_time', form.post_time);
      fd.append('target_groups', JSON.stringify(form.target_groups));
      fd.append('keep_media', '1'); // keep existing when editing

      if (form.is_recurring) {
        fd.append('recurrence_days', String(form.recurrence_days));
        // Calculate next_post_at: today + recurrence_days at post_time
        const d = new Date();
        const [h, m] = form.post_time.split(':').map(Number);
        d.setHours(h, m, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + (form.recurrence_days || 1));
        fd.append('next_post_at', d.toISOString());
      } else {
        fd.append('recurrence_days', '');
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
    } catch (err) {
      alert('Failed to save announcement. Please try again.');
    } finally { setSubmitting(false); }
  };

  const handleSaveAndPostNow = async () => {
    if (form.target_groups.length === 0) {
      alert('Please select at least one target group.');
      return;
    }
    if (newFiles.length === 0 && existingMedia.length === 0) {
      alert('Please upload at least one image or video.');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('caption', form.caption);
      fd.append('is_recurring', form.is_recurring ? '1' : '0');
      fd.append('post_time', form.post_time);
      fd.append('target_groups', JSON.stringify(form.target_groups));
      fd.append('keep_media', '1');

      if (form.is_recurring) {
        fd.append('recurrence_days', String(form.recurrence_days));
        const d = new Date();
        const [h, m] = form.post_time.split(':').map(Number);
        d.setHours(h, m, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + (form.recurrence_days || 1));
        fd.append('next_post_at', d.toISOString());
      } else {
        fd.append('recurrence_days', '');
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
    } catch (err) {
      alert('Failed to save and post announcement. Please try again.');
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
                  required type="text"
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none text-white"
                  placeholder="Announcement title"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </div>

              {/* Caption */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Caption / Message</label>
                <textarea
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none resize-y min-h-[80px] text-white"
                  placeholder="Message text that will accompany the media..."
                  value={form.caption}
                  onChange={e => setForm({ ...form, caption: e.target.value })}
                />
              </div>

              {/* ── Media Ribbon ─────────────────────────────────────────────── */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  <Film size={15} /> Media Ribbon (Images &amp; Videos) *
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
                  <div className="grid grid-cols-2 gap-4">
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

                {/* Recurring: every N days + time */}
                {form.is_recurring && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400">Every N days</label>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">Every</span>
                        <input type="number" min={1} max={365}
                          className="w-20 p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none text-white text-center"
                          value={form.recurrence_days}
                          onChange={e => setForm({ ...form, recurrence_days: parseInt(e.target.value) || 1 })}
                        />
                        <span className="text-slate-400 text-sm">days</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400">Time of day</label>
                      <input type="time"
                        className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none text-white"
                        value={form.post_time}
                        onChange={e => setForm({ ...form, post_time: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Target Groups ─────────────────────────────────────────────── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Users size={15} /> Target Groups *
                  </label>
                  <button type="button" onClick={fetchGroups}
                    className="text-xs text-primary hover:underline flex items-center gap-1">
                    <RefreshCw size={12} className={groupsLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>

                {/* Profile Quick Select */}
                {profiles.length > 0 && (
                  <div className="flex items-center gap-2 bg-slate-900/30 border border-slate-800 rounded-lg p-2">
                    <span className="text-xs text-slate-400 font-medium">Apply Profile:</span>
                    <select
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const prof = profiles.find(p => p.id.toString() === val);
                          if (prof) {
                            setForm(prev => ({
                              ...prev,
                              target_groups: prof.groups
                            }));
                          }
                        }
                      }}
                      className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                      defaultValue=""
                    >
                      <option value="">-- Select Profile --</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.groups.length} groups)</option>
                      ))}
                    </select>
                  </div>
                )}

                {groupsLoading && <p className="text-xs text-slate-500">Loading groups...</p>}

                {!groupsLoading && groups.length === 0 && (
                  <p className="text-xs text-slate-500">
                    No groups loaded. Make sure WhatsApp is connected and click Refresh.
                  </p>
                )}

                {/* Chips */}
                {form.target_groups.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {form.target_groups.map(gid => {
                      const g = groups.find(x => x.id === gid);
                      return (
                        <span key={gid} className="flex items-center gap-1 bg-indigo-600/30 border border-indigo-500/50 text-indigo-300 text-xs px-2 py-1 rounded-full">
                          {g?.name || gid}
                          <button type="button" onClick={() => toggleGroup(gid)} className="hover:text-white"><X size={10} /></button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="max-h-44 overflow-y-auto space-y-1 bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
                  {groups.map(g => (
                    <label key={g.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${form.target_groups.includes(g.id) ? 'bg-indigo-600/20 border border-indigo-500/30' : 'hover:bg-slate-800'}`}>
                      <input type="checkbox"
                        className="accent-indigo-500"
                        checked={form.target_groups.includes(g.id)}
                        onChange={() => toggleGroup(g.id)}
                      />
                      <span className="text-sm text-white">{g.name}</span>
                      {g.isGroup && <span className="ml-auto text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">group</span>}
                    </label>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-700/50 flex justify-end gap-3">
                <button type="button" onClick={closeModal}
                  className="px-6 py-2 rounded-lg font-bold text-slate-400 hover:text-white transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveAndPostNow} disabled={submitting}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer">
                  {submitting && <RefreshCw size={16} className="animate-spin" />}
                  Post Now
                </button>
                <button type="submit" disabled={submitting}
                  className="px-6 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer">
                  {submitting && <RefreshCw size={16} className="animate-spin" />}
                  {editingId ? 'Save Changes' : 'Create Announcement'}
                </button>
              </div>
            </form>
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
