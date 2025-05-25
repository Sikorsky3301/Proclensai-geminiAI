import React, { useState, useEffect } from 'react';
import { Process, useProcesses } from './ProcessProvider';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { RefreshCw, X, Filter, BarChart2, Play, StopCircle, AlertTriangle } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from 'sonner';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip,
  ResponsiveContainer 
} from 'recharts';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ProcessMetrics {
  timestamp: number;
  cpu: number;
  memory: number;
}

export const ProcessTable: React.FC = () => {
  const { processes, loading, refreshProcesses } = useProcesses();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Process;
    direction: 'ascending' | 'descending';
  }>({
    key: 'memoryKb',
    direction: 'descending',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [memoryThreshold, setMemoryThreshold] = useState<number>(1000); // KB
  const [showMemoryChart, setShowMemoryChart] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<{ [key: number]: boolean }>({});
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [processGroups, setProcessGroups] = useState<{ [key: string]: number[] }>({});
  const [processMetrics, setProcessMetrics] = useState<{ [key: number]: ProcessMetrics[] }>({});
  const [autoRecovery, setAutoRecovery] = useState<boolean>(false);
  const [resourceAlerts, setResourceAlerts] = useState<{ [key: number]: boolean }>({});
  const [selectedProcessMetrics, setSelectedProcessMetrics] = useState<ProcessMetrics[]>([]);

  const handleSort = (key: keyof Process) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Track process metrics over time
  useEffect(() => {
    const metricsInterval = setInterval(() => {
      processes.forEach(process => {
        setProcessMetrics(prev => ({
          ...prev,
          [process.pid]: [
            ...(prev[process.pid] || []),
            {
              timestamp: Date.now(),
              cpu: process.cpuKb,
              memory: process.memoryKb
            }
          ].slice(-30) // Keep last 30 data points
        }));
      });
    }, 5000); // Update every 5 seconds

    return () => clearInterval(metricsInterval);
  }, [processes]);

  // Monitor resource usage and set alerts
  useEffect(() => {
    processes.forEach(process => {
      const isHighCpu = process.cpuKb > 1000; // 1GB CPU threshold
      const isHighMemory = process.memoryKb > 2000; // 2GB Memory threshold
      
      if (isHighCpu || isHighMemory) {
        setResourceAlerts(prev => ({ ...prev, [process.pid]: true }));
        if (autoRecovery) {
          handleProcessAction('restart', process.pid);
        }
      } else {
        setResourceAlerts(prev => ({ ...prev, [process.pid]: false }));
      }
    });
  }, [processes, autoRecovery]);

  const handleGroupProcess = (pid: number, group: string) => {
    setProcessGroups(prev => {
      const newGroups = { ...prev };
      // Remove from existing groups
      Object.keys(newGroups).forEach(key => {
        newGroups[key] = newGroups[key].filter(id => id !== pid);
      });
      // Add to new group
      if (group !== 'none') {
        newGroups[group] = [...(newGroups[group] || []), pid];
      }
      return newGroups;
    });
  };

  const getProcessGroup = (pid: number) => {
    return Object.entries(processGroups).find(([_, pids]) => pids.includes(pid))?.[0] || 'none';
  };

  const filteredProcesses = React.useMemo(() => {
    return processes.filter(process => {
      const matchesSearch = 
        process.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        process.pid.toString().includes(searchTerm) ||
        process.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
        process.user.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || process.status === statusFilter;
      const matchesMemory = process.memoryKb <= memoryThreshold;
      const matchesGroup = selectedGroup === 'all' || getProcessGroup(process.pid) === selectedGroup;
      
      return matchesSearch && matchesStatus && matchesMemory && matchesGroup;
    });
  }, [processes, searchTerm, statusFilter, memoryThreshold, selectedGroup, processGroups]);

  const sortedProcesses = React.useMemo(() => {
    return [...filteredProcesses].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredProcesses, sortConfig]);

  // Calculate pagination
  const totalPages = Math.ceil(sortedProcesses.length / itemsPerPage);
  const paginatedProcesses = sortedProcesses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getSortIndicator = (key: keyof Process) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'ascending' ? ' ↑' : ' ↓';
  };

  // Return a stable height even when data is loading
  const tableHeight = "min-h-[300px]";

  const handleProcessAction = async (action: 'start' | 'stop' | 'restart', pid: number) => {
    try {
      setIsProcessing(prev => ({ ...prev, [pid]: true }));

      if (action === 'stop') {
        const response = await fetch(`/api/processes/${pid}/stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to stop process: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.success) {
          toast.success(`Successfully stopped process ${pid}`);
          // Refresh the process list after a short delay
          setTimeout(() => {
            refreshProcesses();
          }, 1000);
        } else {
          throw new Error(result.error || 'Failed to stop process');
        }
      } else if (action === 'start') {
        const response = await fetch(`/api/processes/${pid}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to start process: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.success) {
          toast.success(`Successfully started process ${pid}`);
          setTimeout(() => {
            refreshProcesses();
          }, 1000);
        } else {
          throw new Error(result.error || 'Failed to start process');
        }
      } else if (action === 'restart') {
        // First stop the process
        await handleProcessAction('stop', pid);
        // Then start it again after a short delay
        setTimeout(async () => {
          await handleProcessAction('start', pid);
        }, 2000);
      }
    } catch (error) {
      console.error(`Error ${action}ing process:`, error);
      toast.error(`Failed to ${action} process ${pid}: ${error.message}`);
    } finally {
      setIsProcessing(prev => ({ ...prev, [pid]: false }));
    }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-12rem)]">
      <div className="flex-1 glass-card p-5 animate-fade-up flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            System Processes ({filteredProcesses.length} found)
          </h2>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search processes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="glass-input max-w-xs"
              />
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="none">Ungrouped</SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200">
                  <Filter size={18} className="text-gray-700 dark:text-gray-300" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                    All Status
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter('running')}>
                    Running
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter('sleeping')}>
                    Sleeping
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter('zombie')}>
                    Zombie
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button 
                onClick={() => setShowMemoryChart(!showMemoryChart)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
              >
                <BarChart2 size={18} className="text-gray-700 dark:text-gray-300" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-recovery" className="text-sm text-gray-700 dark:text-gray-300">
                Auto Recovery
              </Label>
              <Switch
                id="auto-recovery"
                checked={autoRecovery}
                onCheckedChange={setAutoRecovery}
              />
            </div>
            <button 
              onClick={(e) => {
                e.preventDefault();
                refreshProcesses();
              }}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
              aria-label="Refresh processes"
            >
              <RefreshCw size={18} className={`text-gray-700 dark:text-gray-300 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        
        {showMemoryChart && (
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory Usage Overview</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Threshold:</span>
                <Input
                  type="number"
                  value={memoryThreshold}
                  onChange={(e) => setMemoryThreshold(Number(e.target.value))}
                  className="w-24 h-8"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">KB</span>
              </div>
            </div>
            <div className="space-y-2">
              {paginatedProcesses.map((process) => (
                <TooltipProvider key={process.pid}>
                  <Tooltip>
                    <TooltipTrigger className="w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-24 truncate">{process.name}</span>
                        <Progress 
                          value={(process.memoryKb / memoryThreshold) * 100} 
                          className="flex-1"
                        />
                        <span className="text-xs w-16 text-right">{process.memoryKb.toFixed(0)} KB</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{process.name} - {process.memoryKb.toFixed(2)} KB</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="table-container flex-1">
            <div className="overflow-auto h-full custom-scrollbar">
              <Table>
                <TableHeader className="table-header sticky top-0 z-10">
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 font-semibold whitespace-nowrap"
                      onClick={() => handleSort('pid')}
                    >
                      PID {getSortIndicator('pid')}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 font-semibold whitespace-nowrap"
                      onClick={() => handleSort('name')}
                    >
                      Name {getSortIndicator('name')}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 font-semibold whitespace-nowrap"
                      onClick={() => handleSort('user')}
                    >
                      User {getSortIndicator('user')}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 font-semibold whitespace-nowrap"
                      onClick={() => handleSort('status')}
                    >
                      Status {getSortIndicator('status')}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 text-right font-semibold whitespace-nowrap"
                      onClick={() => handleSort('cpuKb')}
                    >
                      CPU (KB) {getSortIndicator('cpuKb')}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 text-right font-semibold whitespace-nowrap"
                      onClick={() => handleSort('memoryKb')}
                    >
                      Memory (KB) {getSortIndicator('memoryKb')}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 font-semibold whitespace-nowrap"
                      onClick={() => handleSort('startTime')}
                    >
                      Start Time {getSortIndicator('startTime')}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 text-right font-semibold whitespace-nowrap"
                      onClick={() => handleSort('threads')}
                    >
                      Threads {getSortIndicator('threads')}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 text-right font-semibold whitespace-nowrap"
                      onClick={() => handleSort('priority')}
                    >
                      Priority {getSortIndicator('priority')}
                    </TableHead>
                    <TableHead className="text-right font-semibold whitespace-nowrap">
                      Group
                    </TableHead>
                    <TableHead className="text-right font-semibold whitespace-nowrap">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && !processes.length ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`}>
                        {Array.from({ length: 9 }).map((_, cellIndex) => (
                          <TableCell key={`skeleton-cell-${cellIndex}`}>
                            <div className="h-4 bg-gray-200 dark:bg-gray-800 animate-pulse-subtle rounded"></div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : paginatedProcesses.length > 0 ? (
                    paginatedProcesses.map((process) => (
                      <TableRow 
                        key={process.pid} 
                        className={`table-row cursor-pointer group ${
                          resourceAlerts[process.pid] ? 'bg-red-50 dark:bg-red-900/20' : ''
                        }`}
                        onClick={() => {
                          setSelectedProcess(process);
                          setSelectedProcessMetrics(processMetrics[process.pid] || []);
                        }}
                      >
                        <TableCell className="font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">{process.pid}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">{process.name}</TableCell>
                        <TableCell className="whitespace-nowrap text-gray-700 dark:text-gray-300">{process.user}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span 
                            className={`status-badge ${
                              process.status === 'running' 
                                ? 'status-running'
                                : process.status === 'sleeping' 
                                ? 'status-sleeping'
                                : process.status === 'zombie'
                                ? 'status-zombie'
                                : 'status-other'
                            }`}
                          >
                            {process.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">{process.cpuKb.toFixed(2)} K</TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">{process.memoryKb.toFixed(2)} K</TableCell>
                        <TableCell className="whitespace-nowrap text-gray-700 dark:text-gray-300">{process.startTime}</TableCell>
                        <TableCell className="text-right whitespace-nowrap text-gray-700 dark:text-gray-300">{process.threads}</TableCell>
                        <TableCell className="text-right whitespace-nowrap text-gray-700 dark:text-gray-300">{process.priority}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Select
                            value={getProcessGroup(process.pid)}
                            onValueChange={(value) => handleGroupProcess(process.pid, value)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="system">System</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="critical">Critical</SelectItem>
                              <SelectItem value="none">Ungrouped</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleProcessAction('start', process.pid);
                                    }}
                                    disabled={isProcessing[process.pid]}
                                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Play size={14} className="text-green-600 dark:text-green-400" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Start Process</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleProcessAction('stop', process.pid);
                                    }}
                                    disabled={isProcessing[process.pid]}
                                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <StopCircle size={14} className="text-red-600 dark:text-red-400" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Stop Process</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            
                            {process.memoryKb > memoryThreshold && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle size={14} className="text-yellow-600 dark:text-yellow-400" />
                                  </TooltipTrigger>
                                  <TooltipContent>High Memory Usage</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {resourceAlerts[process.pid] && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="destructive" className="ml-2">
                                      High Resource Usage
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    CPU: {process.cpuKb.toFixed(2)} KB
                                    Memory: {process.memoryKb.toFixed(2)} KB
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-6 text-gray-500 dark:text-gray-400">
                        {searchTerm ? 'No matching processes found' : 'No processes found'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          
          {sortedProcesses.length > itemsPerPage && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink 
                          isActive={pageNum === currentPage}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </div>

      {/* Process Details Sidebar */}
      {selectedProcess && (
        <div className="w-96 glass-card p-5 animate-fade-up overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-4 sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Process Details
            </h3>
            <button
              onClick={() => setSelectedProcess(null)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
            >
              <X size={18} className="text-gray-700 dark:text-gray-300" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Process Name</h4>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedProcess.name}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Process ID</h4>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedProcess.pid}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">User</h4>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedProcess.user}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Status</h4>
              <span 
                className={`status-badge ${
                  selectedProcess.status === 'running' 
                    ? 'status-running'
                    : selectedProcess.status === 'sleeping' 
                    ? 'status-sleeping'
                    : selectedProcess.status === 'zombie'
                    ? 'status-zombie'
                    : 'status-other'
                }`}
              >
                {selectedProcess.status}
              </span>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">CPU Usage</h4>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedProcess.cpuKb.toFixed(2)} KB</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Memory Usage</h4>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedProcess.memoryKb.toFixed(2)} KB</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Start Time</h4>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedProcess.startTime}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Threads</h4>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedProcess.threads}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Priority</h4>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedProcess.priority}</p>
            </div>
            
            {/* Performance Metrics Chart */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                Performance Metrics
              </h4>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedProcessMetrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="timestamp" 
                      tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                    />
                    <YAxis />
                    <RechartsTooltip 
                      labelFormatter={(value) => new Date(value).toLocaleTimeString()}
                      formatter={(value: number) => [`${value.toFixed(2)} KB`, '']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cpu" 
                      stroke="#ef4444" 
                      name="CPU Usage"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="memory" 
                      stroke="#3b82f6" 
                      name="Memory Usage"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Process Group Management */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                Process Group
              </h4>
              <Select
                value={getProcessGroup(selectedProcess.pid)}
                onValueChange={(value) => handleGroupProcess(selectedProcess.pid, value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="none">Ungrouped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Process Actions</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => handleProcessAction('start', selectedProcess.pid)}
                  disabled={isProcessing[selectedProcess.pid]}
                  className="flex-1 px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing[selectedProcess.pid] ? 'Starting...' : 'Start'}
                </button>
                <button
                  onClick={() => handleProcessAction('stop', selectedProcess.pid)}
                  disabled={isProcessing[selectedProcess.pid]}
                  className="flex-1 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing[selectedProcess.pid] ? 'Stopping...' : 'Stop'}
                </button>
                <button
                  onClick={() => handleProcessAction('restart', selectedProcess.pid)}
                  disabled={isProcessing[selectedProcess.pid]}
                  className="flex-1 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing[selectedProcess.pid] ? 'Restarting...' : 'Restart'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
