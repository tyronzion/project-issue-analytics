import React, { useState } from 'react';
import cloudstaffLogo from '../assets/cloudstaff-logo.svg';
import { 
  Upload, 
  GitMerge, 
  Download, 
  Calculator, 
  FolderKanban, 
  SlidersHorizontal,
  Layers,
  PieChart,
  ShieldCheck,
  ListFilter,
  ClipboardList,
  Trash2,
  Ellipsis,
  ChevronDown,
  Bot
} from 'lucide-react';
import { ActiveTab } from '../types';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenImport: () => void;
  onOpenMerge: () => void;
  onExportExcel: () => void;
  onOpenFormulas: () => void;
  onOpenProjects: () => void;
  onOpenTargetList?: () => void;
  onOpenClearData?: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  totalIssuesCount: number;
  activeProjectsCount: number;
  customProjectListCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenImport,
  onOpenMerge,
  onExportExcel,
  onOpenFormulas,
  onOpenProjects,
  onOpenTargetList,
  onOpenClearData,
  onOpenSettings,
  onSignOut,
  totalIssuesCount,
  activeProjectsCount,
  customProjectListCount = 0,
}) => {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const handleMoreAction = (action: () => void) => {
    setIsMoreMenuOpen(false);
    action();
  };

  return (
    <header className="bg-slate-900/90 border-b border-slate-800 text-slate-100 sticky top-0 z-30 shadow-sm backdrop-blur-md">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 py-2">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 min-w-0">
            <img
              src={cloudstaffLogo}
              alt="Cloudstaff"
              className="h-9 w-auto shrink-0"
            />
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-end gap-2 flex-wrap shrink-0">
            <p className="hidden lg:block text-xs text-slate-400 mr-1">
              {activeProjectsCount} Projects Active &bull; {totalIssuesCount} Total Records
            </p>

            <button
              id="btn-import-data"
              onClick={onOpenImport}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition shadow-sm"
              title="Import Excel or CSV dataset"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Import Data</span>
            </button>

            <button
              id="btn-export-excel"
              onClick={onExportExcel}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition shadow-sm shadow-blue-900/20"
              title="Export filtered project metrics to Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>

            <div className="relative">
              <button
                id="btn-more-actions"
                onClick={() => setIsMoreMenuOpen(prev => !prev)}
                className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold text-slate-500 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition shadow-sm"
                title="More actions"
              >
                <Ellipsis className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">More</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-40 p-1.5 space-y-1">
                  {onOpenTargetList && (
                    <button
                      id="menu-target-list"
                      onClick={() => handleMoreAction(onOpenTargetList)}
                      className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition"
                    >
                      <span className="inline-flex items-center space-x-1.5">
                        <ClipboardList className="w-3.5 h-3.5 text-blue-500" />
                        <span>Target Project List</span>
                      </span>
                      <span className="text-blue-600">{customProjectListCount > 0 ? `(${customProjectListCount})` : ''}</span>
                    </button>
                  )}

                  <button
                    id="menu-merge-data"
                    onClick={() => handleMoreAction(onOpenMerge)}
                    className="w-full flex items-center space-x-1.5 px-2.5 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition"
                  >
                    <GitMerge className="w-3.5 h-3.5 text-blue-500" />
                    <span>Merge Data</span>
                  </button>

                  {onOpenClearData && (
                    <button
                      id="menu-clear-all-data"
                      onClick={() => handleMoreAction(onOpenClearData)}
                      className="w-full flex items-center space-x-1.5 px-2.5 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-blue-500" />
                      <span>Delete All Data</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              id="btn-open-settings"
              onClick={onOpenSettings}
              className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition"
              title="Settings and Configuration Backup"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <button
              id="btn-sign-out"
              onClick={onSignOut}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg border border-slate-700 transition"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden">
          <button
            id="tab-dashboard-btn"
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Project Metrics</span>
          </button>
          <button
            id="tab-charts-btn"
            onClick={() => setActiveTab('charts')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'charts'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          <button
            id="tab-security-seal-btn"
            onClick={() => setActiveTab('seal')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'seal'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Security Seal</span>
          </button>
          <button
            id="tab-issues-btn"
            onClick={() => setActiveTab('issues')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'issues'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>All Issues</span>
          </button>
          <button
            id="tab-jira-btn"
            onClick={() => setActiveTab('jira')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'jira'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Jira Integration</span>
          </button>
          <button
            id="tab-projects-btn"
            onClick={() => setActiveTab('projects')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'projects'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>Projects & Aliases</span>
          </button>
          <button
            id="tab-formulas-btn"
            onClick={() => setActiveTab('formulas')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'formulas'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>Formula Rules</span>
          </button>
        </nav>

        {/* Mobile Sub-Navigation */}
        <div className="xl:hidden flex items-center justify-between py-2 border-t border-slate-800 overflow-x-auto space-x-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1 text-xs rounded-md whitespace-nowrap ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300'
            }`}
          >
            Project Metrics
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`px-3 py-1 text-xs rounded-md whitespace-nowrap ${
              activeTab === 'charts' ? 'bg-blue-600 text-white' : 'text-slate-300'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('seal')}
            className={`px-3 py-1 text-xs rounded-md whitespace-nowrap ${
              activeTab === 'seal' ? 'bg-blue-600 text-white' : 'text-slate-300'
            }`}
          >
            Security Seal
          </button>
          <button
            onClick={() => setActiveTab('dependabots')}
            className={`px-3 py-1 text-xs rounded-md whitespace-nowrap inline-flex items-center space-x-1 ${
              activeTab === 'dependabots' ? 'bg-blue-600 text-white' : 'text-slate-300'
            }`}
          >
            <Bot className="w-3 h-3" />
            <span>Dependabots</span>
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`px-3 py-1 text-xs rounded-md whitespace-nowrap ${
              activeTab === 'issues' ? 'bg-blue-600 text-white' : 'text-slate-300'
            }`}
          >
            All Issues
          </button>
          <button
            onClick={() => setActiveTab('jira')}
            className={`px-3 py-1 text-xs rounded-md whitespace-nowrap inline-flex items-center space-x-1 ${
              activeTab === 'jira' ? 'bg-blue-600 text-white' : 'text-slate-300'
            }`}
          >
            <Bot className="w-3 h-3" />
            <span>Jira</span>
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-3 py-1 text-xs rounded-md whitespace-nowrap ${
              activeTab === 'projects' ? 'bg-blue-600 text-white' : 'text-slate-300'
            }`}
          >
            Projects
          </button>
          <button
            onClick={() => setActiveTab('formulas')}
            className={`px-3 py-1 text-xs rounded-md whitespace-nowrap ${
              activeTab === 'formulas' ? 'bg-blue-600 text-white' : 'text-slate-300'
            }`}
          >
            Formulas
          </button>
        </div>

      </div>
    </header>
  );
};
