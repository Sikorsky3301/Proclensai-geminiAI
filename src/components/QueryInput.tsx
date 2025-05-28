import React, { useState, useEffect } from 'react';
import { useProcesses } from './ProcessProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

// Gemini API configuration
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Function to check if Gemini API key is configured
const isGeminiConfigured = (): boolean => {
  console.log('Checking Gemini API key:', GEMINI_API_KEY ? 'Present' : 'Missing');
  return !!GEMINI_API_KEY;
};

// Function to format process data for better context
const formatProcessContext = (processes: any[], systemResources: any) => {
  if (!processes || processes.length === 0) {
    console.log('No processes available');
    return 'No processes available for analysis.';
  }

  // Sort processes by memory usage
  const sortedProcesses = [...processes].sort((a, b) => b.memoryPercent - a.memoryPercent);
  
  const processDetails = sortedProcesses.map(proc => 
    `Process: ${proc.name}
    - PID: ${proc.pid}
    - Status: ${proc.status}
    - User: ${proc.user}
    - CPU Usage: ${proc.cpuPercent.toFixed(2)}%
    - Memory Usage: ${proc.memoryPercent.toFixed(2)}%
    - Start Time: ${proc.startTime}
    - Threads: ${proc.threads}
    - Priority: ${proc.priority}`
  ).join('\n\n');

  const systemInfo = `
System Resources:
- Total CPU Usage: ${systemResources.totalCpuUsage.toFixed(2)}%
- Total Memory Usage: ${systemResources.totalMemoryUsage.toFixed(2)} MB
- Total Available Memory: ${systemResources.totalMemory} MB
- Disk Usage: ${systemResources.diskUsage.toFixed(2)} MB
- Total Disk Space: ${systemResources.totalDisk} MB
- Network Usage: ${systemResources.networkUsage.toFixed(2)} MB/s
`;

  return `System Information and Processes:

${systemInfo}

Detailed Process Information:
${processDetails}

Note: Processes are sorted by memory usage. Each process entry includes its PID, status, user, resource usage, and other relevant details.`;
};

// Function to query the Gemini API with retry logic
const queryGemini = async (query: string, context: string, retries = 2): Promise<string> => {
  if (!GEMINI_API_KEY) {
    console.error('Gemini API key is missing');
    throw new Error('Gemini API key is not configured');
  }

  const prompt = `You are a system monitoring assistant. Analyze the following detailed system and process information to provide accurate and helpful answers:

${context}

User Question: ${query}

Please provide a comprehensive response based on the system data provided. Include relevant metrics and specific process details in your answer.`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt + 1} to query Gemini API...`);
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Gemini API error response:', errorData);
        
        // If we get a rate limit error, wait before retrying
        if (response.status === 429 && attempt < retries) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        throw new Error(`Gemini API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('Gemini API response:', data);
      
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!generatedText) {
        console.error('No text generated in response:', data);
        throw new Error('No response generated from Gemini');
      }

      return generatedText;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      
      // If this was the last attempt, throw the error
      if (attempt === retries) {
        throw error;
      }
      
      // Otherwise, wait before retrying
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('All retry attempts failed');
};

export const QueryInput: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [geminiAvailable, setGeminiAvailable] = useState<boolean | null>(null);
  const { processes, systemResources, addToChatHistory } = useProcesses();

  // Function to scroll to the AI interaction section
  const scrollToAI = () => {
    const aiSection = document.getElementById('ai-interaction');
    if (aiSection) {
      aiSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Check Gemini availability when component mounts
  useEffect(() => {
    console.log('Checking Gemini configuration...');
    const configured = isGeminiConfigured();
    setGeminiAvailable(configured);
    if (!configured) {
      toast.error('Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your environment variables.');
    }
  }, []);

  // Focus on the input field when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToAI();
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) {
      toast.error('Please enter a query');
      return;
    }

    if (!geminiAvailable) {
      toast.error('Gemini API is not available. Please configure your API key.');
      return;
    }

    if (!processes || processes.length === 0) {
      toast.error('No process data available. Please try again later.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log('Formatting process context...');
      const context = formatProcessContext(processes, systemResources);
      console.log('Sending query to Gemini...');
      const response = await queryGemini(query, context);
      console.log('Received response from Gemini:', response);
      addToChatHistory(response);
      setQuery('');
      
      // Scroll to response after a short delay
      setTimeout(() => {
        scrollToAI();
      }, 100);
      
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to get a response: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-card p-5 my-6 animate-fade-up">
      <h2 className="text-xl font-medium mb-4">Ask About System Processes</h2>
      
      {geminiAvailable === false && (
        <div className="mb-4 p-2 bg-amber-100 dark:bg-amber-900/30 rounded text-amber-800 dark:text-amber-200 text-sm">
          Gemini API key is not configured. Add VITE_GEMINI_API_KEY to your environment variables.
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What would you like to know about these processes?"
          className="glass-input flex-1"
          disabled={isLoading || !geminiAvailable}
          autoFocus
        />
        <Button 
          type="submit" 
          disabled={isLoading || !query.trim() || !geminiAvailable}
          className="bg-primary hover:bg-primary/90 transition-colors"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </Button>
      </form>
    </div>
  );
};
