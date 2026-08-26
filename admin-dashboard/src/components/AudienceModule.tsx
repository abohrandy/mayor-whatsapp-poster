import { useState } from 'react';
import { Users, MessageSquare, FolderPlus } from 'lucide-react';
import GroupListsManager from './GroupListsManager';
import AudienceLists from './AudienceLists';

// Contacts and Contact Lists management are temporarily hidden from this panel while we
// focus on Groups-only targeting; ContactsManager/ContactListsManager are left in place
// (unused for now) so this can be switched back on later without rebuilding them.
const AudienceModule = () => {
  const [activeSubTab, setActiveSubTab] = useState<'group-lists' | 'groups' | 'audience-lists'>('groups');
  const [autoCreateGroupList, setAutoCreateGroupList] = useState(false);

  const handleSwitchToCreateGroupList = () => {
    setAutoCreateGroupList(true);
    setActiveSubTab('group-lists');
  };

  const handleSubTabChange = (tab: 'group-lists' | 'groups' | 'audience-lists') => {
    if (tab !== 'group-lists') {
      setAutoCreateGroupList(false);
    }
    setActiveSubTab(tab);
  };

  return (
    <div className="space-y-6">
      {/* Module Title Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Audience Management</h2>
        <p className="text-slate-400 text-sm">Manage group lists, WhatsApp groups, and combined audience targeting lists.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 space-x-1">
        <button
          onClick={() => handleSubTabChange('group-lists')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'group-lists'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <FolderPlus size={16} /> Group Lists
        </button>

        <button
          onClick={() => handleSubTabChange('groups')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'groups'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <MessageSquare size={16} /> WhatsApp Groups
        </button>

        <button
          onClick={() => handleSubTabChange('audience-lists')}
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
      {activeSubTab === 'group-lists' && (
        <GroupListsManager
          key={autoCreateGroupList ? 'create' : 'list'}
          initialCreateMode={autoCreateGroupList}
        />
      )}
      {activeSubTab === 'groups' && (
        <AudienceLists
          showGroupsOnly={true}
          onSwitchToCreateAudience={handleSwitchToCreateGroupList}
        />
      )}
      {activeSubTab === 'audience-lists' && <AudienceLists />}
    </div>
  );
};

export default AudienceModule;
