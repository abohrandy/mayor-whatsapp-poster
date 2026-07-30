import { useState } from 'react';
import { User, List, Users, MessageSquare } from 'lucide-react';
import ContactsManager from './ContactsManager';
import ContactListsManager from './ContactListsManager';
import AudienceLists from './AudienceLists';

const AudienceModule = () => {
  const [activeSubTab, setActiveSubTab] = useState<'contacts' | 'contact-lists' | 'audience-lists' | 'groups'>('contacts');

  return (
    <div className="space-y-6">
      {/* Module Title Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Audience Management</h2>
        <p className="text-slate-400 text-sm">Manage contacts, contact lists, WhatsApp groups, and combined audience targeting lists.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 space-x-1">
        <button
          onClick={() => setActiveSubTab('contacts')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'contacts'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <User size={16} /> Contacts
        </button>

        <button
          onClick={() => setActiveSubTab('contact-lists')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'contact-lists'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <List size={16} /> Contact Lists
        </button>

        <button
          onClick={() => setActiveSubTab('groups')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'groups'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <MessageSquare size={16} /> WhatsApp Groups
        </button>

        <button
          onClick={() => setActiveSubTab('audience-lists')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'audience-lists'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Users size={16} /> Audience Lists
        </button>
      </div>

      {/* Subtab Content */}
      {activeSubTab === 'contacts' && <ContactsManager />}
      {activeSubTab === 'contact-lists' && <ContactListsManager />}
      {activeSubTab === 'groups' && <AudienceLists showGroupsOnly={true} />}
      {activeSubTab === 'audience-lists' && <AudienceLists />}
    </div>
  );
};

export default AudienceModule;
