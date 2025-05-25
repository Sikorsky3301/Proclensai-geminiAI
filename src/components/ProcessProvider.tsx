import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

export interface Process {
  pid: number;
  name: string;
  status: string;
  cpuKb: number;
  memoryKb: number;
  user: string;
  startTime: string;
  threads: number;
  priority: number;
}

interface SystemResources {
  totalCpuUsage: number;
  totalMemoryUsage: number;
  totalMemory: number;
  diskUsage: number;
  totalDisk: number;
  networkUsage: number;
}

interface ProcessContextType {
  processes: Process[];
  systemResources: SystemResources;
  loading: boolean;
  error: string | null;
  refreshProcesses: () => void;
  chatHistory: string[];
  addToChatHistory: (response: string) => void;
}

const ProcessContext = createContext<ProcessContextType | undefined>(undefined);

export const useProcesses = () => {
  const context = useContext(ProcessContext);
  if (!context) {
    throw new Error('useProcesses must be used within a ProcessProvider');
  }
  return context;
};

// API URL for fetching system data
const API_BASE_URL = 'http://localhost:3002';

// Fetch process data from the backend API
const fetchProcesses = async (): Promise<Process[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/processes`, { timeout: 5000 });
    if (!response.ok) {
      throw new Error(`Failed to fetch process data: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Process data fetch error: ${error.message}`);
    }
    throw new Error('Unknown error occurred while fetching process data');
  }
};

// Fetch system resource data from the backend API
const fetchSystemResources = async (): Promise<SystemResources> => {
  try {
    const response = await fetch(`${API_BASE_URL}/system-resources`, { timeout: 5000 });
    if (!response.ok) {
      throw new Error(`Failed to fetch system resource data: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`System resource fetch error: ${error.message}`);
    }
    throw new Error('Unknown error occurred while fetching system resources');
  }
};

interface ProcessProviderProps {
  children: React.ReactNode;
  onError?: (error: Error) => void;
}

export const ProcessProvider: React.FC<ProcessProviderProps> = ({ children, onError }) => {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [systemResources, setSystemResources] = useState<SystemResources>({
    totalCpuUsage: 0,
    totalMemoryUsage: 0,
    totalMemory: 32000,
    diskUsage: 0,
    totalDisk: 1000000,
    networkUsage: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const REFRESH_INTERVAL = 10000; // 10 seconds

  const refreshProcesses = async () => {
    try {
      if (processes.length === 0) {
        setLoading(true);
      }
      
      const [processData, resourceData] = await Promise.all([
        fetchProcesses(),
        fetchSystemResources()
      ]);
      
      setProcesses(prevProcesses => {
        const hasChanged = !prevProcesses.length || 
          JSON.stringify(processData.slice(0, 5)) !== JSON.stringify(prevProcesses.slice(0, 5));
        
        return hasChanged ? processData : prevProcesses;
      });
      
      setSystemResources(resourceData);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch system data');
      setError(error.message);
      toast.error(error.message);
      console.error(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  const addToChatHistory = (response: string) => {
    setChatHistory(prev => [...prev, response]);
  };

  useEffect(() => {
    refreshProcesses();
    
    intervalRef.current = setInterval(refreshProcesses, REFRESH_INTERVAL);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <ProcessContext.Provider 
      value={{ 
        processes, 
        systemResources,
        loading, 
        error, 
        refreshProcesses,
        chatHistory,
        addToChatHistory
      }}
    >
      {children}
    </ProcessContext.Provider>
  );
};
