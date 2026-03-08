import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MoodEntry {
  id: number;
  employeeId: number;
  employeeName: string;
  date: string;
  mood: 'excellent' | 'good' | 'neutral' | 'tired' | 'stressed';
  moodScore: number; // 1-10
  productivity: number; // 1-10
  comment?: string;
  factors: string[];
}

interface TeamMood {
  date: string;
  averageMood: number;
  averageProductivity: number;
  teamSize: number;
  happyPercent: number;
  neutralPercent: number;
  stressedPercent: number;
}

export const MoodProductivity = () => {
  const [view, setView] = useState<'personal' | 'team'>('personal');
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [moodToday, setMoodToday] = useState<number>(7);
  const [productivityToday, setProductivityToday] = useState<number>(8);
  const [moodFactors, setMoodFactors] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  
  // Sample personal mood data (for current user)
  const personalMoodData = [
    { day: 'Mon', date: '2025-05-09', mood: 6, productivity: 7, factors: ['High workload', 'Deadline pressure'] },
    { day: 'Tue', date: '2025-05-10', mood: 7, productivity: 8, factors: ['Team collaboration'] },
    { day: 'Wed', date: '2025-05-11', mood: 9, productivity: 9, factors: ['Completed project', 'Team recognition'] },
    { day: 'Thu', date: '2025-05-12', mood: 8, productivity: 8, factors: ['Good team meeting'] },
    { day: 'Fri', date: '2025-05-13', mood: 5, productivity: 6, factors: ['Technical issues', 'Deadline pressure'] },
    { day: 'Sat', date: '2025-05-14', mood: 6, productivity: 6, factors: ['Weekend work'] },
    { day: 'Sun', date: '2025-05-15', mood: 8, productivity: 7, factors: ['Relaxed schedule'] },
  ];
  
  // Sample team mood data
  const teamMoodData: TeamMood[] = [
    { date: '2025-05-09', averageMood: 6.8, averageProductivity: 7.2, teamSize: 12, happyPercent: 45, neutralPercent: 40, stressedPercent: 15 },
    { date: '2025-05-10', averageMood: 7.1, averageProductivity: 7.5, teamSize: 12, happyPercent: 50, neutralPercent: 42, stressedPercent: 8 },
    { date: '2025-05-11', averageMood: 7.8, averageProductivity: 8.1, teamSize: 12, happyPercent: 75, neutralPercent: 20, stressedPercent: 5 },
    { date: '2025-05-12', averageMood: 7.5, averageProductivity: 7.9, teamSize: 12, happyPercent: 67, neutralPercent: 25, stressedPercent: 8 },
    { date: '2025-05-13', averageMood: 6.2, averageProductivity: 6.5, teamSize: 12, happyPercent: 33, neutralPercent: 42, stressedPercent: 25 },
    { date: '2025-05-14', averageMood: 6.5, averageProductivity: 6.8, teamSize: 10, happyPercent: 40, neutralPercent: 40, stressedPercent: 20 },
    { date: '2025-05-15', averageMood: 7.4, averageProductivity: 7.1, teamSize: 8, happyPercent: 62, neutralPercent: 25, stressedPercent: 13 },
  ];
  
  // Sample mood factors options
  const moodFactorsOptions = [
    { id: 'workload', label: 'Workload', type: 'negative' },
    { id: 'deadline', label: 'Deadline pressure', type: 'negative' },
    { id: 'tech_issues', label: 'Technical issues', type: 'negative' },
    { id: 'team_conflict', label: 'Team conflict', type: 'negative' },
    { id: 'cooperation', label: 'Team cooperation', type: 'positive' },
    { id: 'achievement', label: 'Achievement', type: 'positive' },
    { id: 'recognition', label: 'Recognition', type: 'positive' },
    { id: 'learning', label: 'Learning new skills', type: 'positive' },
    { id: 'work_variety', label: 'Work variety', type: 'positive' },
    { id: 'work_environment', label: 'Work environment', type: 'neutral' },
  ];
  
  // AI-generated insights based on sample data
  const aiInsights = [
    {
      id: 1,
      type: 'pattern',
      title: 'Mood Pattern Detected',
      description: 'Your mood tends to dip on Fridays, often associated with "deadline pressure". Consider discussing workload distribution with your manager.',
      icon: 'psychology',
    },
    {
      id: 2,
      type: 'correlation',
      title: 'Productivity Correlation',
      description: 'Team recognition significantly increases both your mood (+38%) and productivity (+25%). Consider implementing more peer recognition practices.',
      icon: 'insights',
    },
    {
      id: 3,
      type: 'team',
      title: 'Team Comparison',
      description: 'Your mood is generally 12% higher than team average when collaborating on projects.',
      icon: 'groups',
    },
  ];
  
  // Generate recommended actions based on current mood and productivity
  const getRecommendedActions = () => {
    if (moodToday <= 4) {
      return [
        { text: 'Take a short break to refresh', icon: 'self_improvement' },
        { text: 'Talk to your manager about workload', icon: 'person' },
        { text: 'Consider using your wellness day', icon: 'spa' },
      ];
    } else if (moodToday <= 6) {
      return [
        { text: 'Try the Pomodoro technique for focus', icon: 'timer' },
        { text: 'Schedule a team lunch or coffee break', icon: 'local_cafe' },
        { text: 'Prioritize your most important task first', icon: 'priority_high' },
      ];
    } else {
      return [
        { text: 'Share your success with the team', icon: 'emoji_events' },
        { text: 'Mentor a colleague who might be struggling', icon: 'people' },
        { text: 'Document what is working well', icon: 'assignment_turned_in' },
      ];
    }
  };
  
  // Calculate average mood and productivity
  const averageMood = personalMoodData.reduce((sum, day) => sum + day.mood, 0) / personalMoodData.length;
  const averageProductivity = personalMoodData.reduce((sum, day) => sum + day.productivity, 0) / personalMoodData.length;
  
  // Get mood emoji based on score
  const getMoodEmoji = (score: number) => {
    if (score >= 9) return '😁';
    if (score >= 7) return '🙂';
    if (score >= 5) return '😐';
    if (score >= 3) return '🙁';
    return '😫';
  };
  
  // Get mood color based on score
  const getMoodColor = (score: number) => {
    if (score >= 8) return 'text-emerald-500';
    if (score >= 6) return 'text-blue-500';
    if (score >= 4) return 'text-amber-500';
    return 'text-red-500';
  };
  
  // Handle mood factor toggle
  const toggleMoodFactor = (factor: string) => {
    if (moodFactors.includes(factor)) {
      setMoodFactors(moodFactors.filter(f => f !== factor));
    } else {
      setMoodFactors([...moodFactors, factor]);
    }
  };
  
  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-md">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value}/10
            </p>
          ))}
        </div>
      );
    }
    return null;
  };
  
  // Format day from date
  const formatDay = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
  };
  
  return (
    <Card className="overflow-hidden border-primary/10 shadow-md bg-white/90 backdrop-blur-sm mb-6">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium flex items-center">
            <span className="material-icons mr-2 text-primary">sentiment_satisfied</span>
            AI Mood & Productivity Tracker
          </CardTitle>
          
          <div className="flex">
            <button 
              onClick={() => setView('personal')}
              className={`px-3 py-1 text-sm rounded-l-md ${view === 'personal' ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-dark'}`}
            >
              Personal
            </button>
            <button 
              onClick={() => setView('team')}
              className={`px-3 py-1 text-sm rounded-r-md ${view === 'team' ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-dark'}`}
            >
              Team
            </button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4">
        {view === 'personal' ? (
          <div>
            {/* Today's Check-in */}
            <div className="mb-6 bg-neutral-50 rounded-lg p-4 border border-neutral-200">
              <h3 className="font-medium mb-3 text-neutral-darkest">How are you feeling today?</h3>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Mood</span>
                    <span className="text-sm font-medium">{moodToday}/10</span>
                  </div>
                  <div className="flex items-center gap-1 mb-3">
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={moodToday} 
                      onChange={(e) => setMoodToday(parseInt(e.target.value))}
                      className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between text-lg">
                    <span>😫</span>
                    <span>🙁</span>
                    <span>😐</span>
                    <span>🙂</span>
                    <span>😁</span>
                  </div>
                </div>
                
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Productivity</span>
                    <span className="text-sm font-medium">{productivityToday}/10</span>
                  </div>
                  <div className="flex items-center gap-1 mb-3">
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={productivityToday} 
                      onChange={(e) => setProductivityToday(parseInt(e.target.value))}
                      className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between text-sm text-neutral-dark">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="text-sm mb-2">What factors are influencing your mood today?</div>
                <div className="flex flex-wrap gap-2">
                  {moodFactorsOptions.map(factor => (
                    <button
                      key={factor.id}
                      onClick={() => toggleMoodFactor(factor.label)}
                      className={`px-2 py-1 text-xs rounded-full border ${
                        moodFactors.includes(factor.label)
                          ? factor.type === 'negative'
                            ? 'bg-red-100 border-red-200 text-red-800'
                            : factor.type === 'positive'
                            ? 'bg-green-100 border-green-200 text-green-800'
                            : 'bg-blue-100 border-blue-200 text-blue-800'
                          : 'bg-neutral-100 border-neutral-200 text-neutral-dark'
                      }`}
                    >
                      {factor.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mb-4">
                <div className="text-sm mb-1">Any additional comments? (optional)</div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share your thoughts..."
                  className="w-full p-2 border border-neutral-200 rounded-md text-sm"
                  rows={2}
                />
              </div>
              
              <div className="flex justify-end">
                <button className="bg-primary text-white px-4 py-2 rounded-md text-sm hover:bg-primary-dark transition-colors">
                  Submit Check-in
                </button>
              </div>
            </div>
            
            <Tabs defaultValue="trends">
              <TabsList>
                <TabsTrigger value="trends">Trends</TabsTrigger>
                <TabsTrigger value="insights">AI Insights</TabsTrigger>
                <TabsTrigger value="actions">Recommended Actions</TabsTrigger>
              </TabsList>
              
              <TabsContent value="trends" className="pt-4">
                {/* Mood and Productivity Chart */}
                <div className="h-64 mb-5">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={personalMoodData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis domain={[0, 10]} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="mood"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Mood"
                      />
                      <Line
                        type="monotone"
                        dataKey="productivity"
                        stroke="#0284c7"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Productivity"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Weekly Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="bg-gradient-to-br from-orange-100 to-orange-50 p-4 rounded-lg text-center border border-orange-200">
                    <div className="text-3xl mb-1">{getMoodEmoji(averageMood)}</div>
                    <div className="text-sm font-medium">Average Mood</div>
                    <div className={`text-lg font-semibold ${getMoodColor(averageMood)}`}>{averageMood.toFixed(1)}/10</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-100 to-blue-50 p-4 rounded-lg text-center border border-blue-200">
                    <div className="text-3xl mb-1">⚡</div>
                    <div className="text-sm font-medium">Productivity</div>
                    <div className="text-lg font-semibold text-blue-600">{averageProductivity.toFixed(1)}/10</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-emerald-100 to-emerald-50 p-4 rounded-lg text-center border border-emerald-200">
                    <div className="text-3xl mb-1">🏆</div>
                    <div className="text-sm font-medium">Best Day</div>
                    <div className="text-lg font-semibold text-emerald-600">Wed (+28%)</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-amber-100 to-amber-50 p-4 rounded-lg text-center border border-amber-200">
                    <div className="text-3xl mb-1">🔍</div>
                    <div className="text-sm font-medium">Top Factor</div>
                    <div className="text-lg font-semibold text-amber-600">Deadlines</div>
                  </div>
                </div>
                
                {/* Common Factors */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium mb-2">Mood Influencing Factors</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border border-red-200 bg-red-50 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-red-700 mb-1">Negative Factors</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-200">
                          <span className="text-sm">Deadline pressure</span>
                          <Badge className="bg-red-100 text-red-800 border-red-200">3 days</Badge>
                        </div>
                        <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-200">
                          <span className="text-sm">Technical issues</span>
                          <Badge className="bg-red-100 text-red-800 border-red-200">2 days</Badge>
                        </div>
                      </div>
                    </div>
                    
                    <div className="border border-green-200 bg-green-50 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-green-700 mb-1">Positive Factors</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-200">
                          <span className="text-sm">Team collaboration</span>
                          <Badge className="bg-green-100 text-green-800 border-green-200">3 days</Badge>
                        </div>
                        <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-200">
                          <span className="text-sm">Recognition</span>
                          <Badge className="bg-green-100 text-green-800 border-green-200">1 day</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="insights" className="pt-4">
                <div className="space-y-4">
                  {aiInsights.map(insight => (
                    <div key={insight.id} className="border border-primary/20 rounded-lg p-4 bg-primary/5">
                      <div className="flex">
                        <div className="p-2 rounded-full bg-primary/20 text-primary mr-3">
                          <span className="material-icons">{insight.icon}</span>
                        </div>
                        <div>
                          <h3 className="font-medium mb-1">{insight.title}</h3>
                          <p className="text-sm text-neutral-dark">{insight.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                    <div className="flex">
                      <div className="p-2 rounded-full bg-blue-200 text-blue-700 mr-3">
                        <span className="material-icons">tips_and_updates</span>
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">AI Recommendation</h3>
                        <p className="text-sm text-neutral-dark mb-2">Based on your patterns, scheduling focused work in the morning could improve your productivity by approximately 15%.</p>
                        <button className="text-sm text-primary hover:text-primary-dark font-medium">
                          Try this recommendation
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="actions" className="pt-4">
                <div>
                  <h3 className="font-medium mb-3 flex items-center">
                    <span className="material-icons text-primary mr-2">lightbulb</span>
                    Recommended Actions
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {getRecommendedActions().map((action, index) => (
                      <div key={index} className="border border-primary/20 rounded-lg p-4 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer">
                        <div className="flex items-center mb-2">
                          <span className="material-icons text-primary mr-2">{action.icon}</span>
                          <span className="font-medium">{action.text}</span>
                        </div>
                        <p className="text-xs text-neutral-dark">
                          This action has helped 78% of people with similar mood patterns improve their wellbeing score.
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                    <h4 className="font-medium mb-2">Weekly Wellbeing Challenges</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-200">
                        <div className="flex items-center">
                          <span className="material-icons text-primary mr-2">self_improvement</span>
                          <span className="text-sm">Take 3 mindfulness breaks</span>
                        </div>
                        <Badge className="bg-primary/10 text-primary">2/3 Completed</Badge>
                      </div>
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-200">
                        <div className="flex items-center">
                          <span className="material-icons text-emerald-500 mr-2">emoji_people</span>
                          <span className="text-sm">Give 5 team appreciations</span>
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-800">5/5 Completed</Badge>
                      </div>
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-200">
                        <div className="flex items-center">
                          <span className="material-icons text-blue-500 mr-2">water_drop</span>
                          <span className="text-sm">Drink 8 glasses of water daily</span>
                        </div>
                        <Badge className="bg-blue-100 text-blue-800">3/5 Days</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div>
            {/* Team Mood View */}
            <div className="mb-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium">Team Mood & Productivity</h3>
                <div className="flex bg-neutral-100 rounded-md">
                  <button 
                    className={`px-3 py-1 text-xs rounded-md ${selectedPeriod === 'week' ? 'bg-primary text-white' : ''}`}
                    onClick={() => setSelectedPeriod('week')}
                  >
                    Week
                  </button>
                  <button 
                    className={`px-3 py-1 text-xs rounded-md ${selectedPeriod === 'month' ? 'bg-primary text-white' : ''}`}
                    onClick={() => setSelectedPeriod('month')}
                  >
                    Month
                  </button>
                  <button 
                    className={`px-3 py-1 text-xs rounded-md ${selectedPeriod === 'quarter' ? 'bg-primary text-white' : ''}`}
                    onClick={() => setSelectedPeriod('quarter')}
                  >
                    Quarter
                  </button>
                </div>
              </div>
              
              {/* Team Mood Chart */}
              <div className="h-64 mb-5">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={teamMoodData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDay} />
                    <YAxis domain={[0, 10]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="averageMood"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      name="Avg. Mood"
                    />
                    <Line
                      type="monotone"
                      dataKey="averageProductivity"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      name="Avg. Productivity"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              
              {/* Team Distribution */}
              <div className="h-64 mb-5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={teamMoodData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDay} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="happyPercent"
                      stackId="1"
                      stroke="#10b981"
                      fill="#d1fae5"
                      name="Happy"
                    />
                    <Area
                      type="monotone"
                      dataKey="neutralPercent"
                      stackId="1"
                      stroke="#6366f1"
                      fill="#e0e7ff"
                      name="Neutral"
                    />
                    <Area
                      type="monotone"
                      dataKey="stressedPercent"
                      stackId="1"
                      stroke="#ef4444"
                      fill="#fee2e2"
                      name="Stressed"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              
              {/* Team Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-primary/20 rounded-lg p-4 bg-primary/5">
                  <h3 className="font-medium flex items-center mb-2">
                    <span className="material-icons text-primary mr-2">insights</span>
                    Team Mood Insights
                  </h3>
                  <ul className="text-sm space-y-2">
                    <li className="flex items-start">
                      <span className="material-icons text-amber-500 mr-2 text-sm">arrow_downward</span>
                      <span>Team mood dropped by 17% on Friday, correlating with project deadline</span>
                    </li>
                    <li className="flex items-start">
                      <span className="material-icons text-emerald-500 mr-2 text-sm">arrow_upward</span>
                      <span>Wednesday had highest team mood, following the successful project delivery</span>
                    </li>
                    <li className="flex items-start">
                      <span className="material-icons text-blue-500 mr-2 text-sm">lightbulb</span>
                      <span>Teams with regular check-ins show 23% higher average mood scores</span>
                    </li>
                  </ul>
                </div>
                
                <div className="border border-primary/20 rounded-lg p-4 bg-primary/5">
                  <h3 className="font-medium flex items-center mb-2">
                    <span className="material-icons text-primary mr-2">analytics</span>
                    Productivity Patterns
                  </h3>
                  <ul className="text-sm space-y-2">
                    <li className="flex items-start">
                      <span className="material-icons text-amber-500 mr-2 text-sm">trending_down</span>
                      <span>Productivity decreases by 15% when team stress levels exceed 20%</span>
                    </li>
                    <li className="flex items-start">
                      <span className="material-icons text-emerald-500 mr-2 text-sm">trending_up</span>
                      <span>Productivity is highest in morning hours (9-11 AM) for 68% of team</span>
                    </li>
                    <li className="flex items-start">
                      <span className="material-icons text-blue-500 mr-2 text-sm">lightbulb</span>
                      <span>Teams with balanced workload show 28% higher consistent productivity</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Team Recommendations */}
            <div className="border-t pt-4 mt-4">
              <h3 className="font-medium mb-3">AI-Generated Team Recommendations</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                  <div className="flex items-center mb-2">
                    <span className="material-icons text-blue-600 mr-2">date_range</span>
                    <span className="font-medium">Schedule Adjustment</span>
                  </div>
                  <p className="text-sm text-neutral-dark mb-3">Consider shifting deadline-intensive work away from Fridays to improve end-of-week team morale.</p>
                  <button className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md">
                    View Details
                  </button>
                </div>
                
                <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50">
                  <div className="flex items-center mb-2">
                    <span className="material-icons text-emerald-600 mr-2">celebration</span>
                    <span className="font-medium">Recognition Program</span>
                  </div>
                  <p className="text-sm text-neutral-dark mb-3">Implement weekly team recognition program to sustain the positive effect observed after project completion.</p>
                  <button className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-md">
                    Implementation Guide
                  </button>
                </div>
                
                <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                  <div className="flex items-center mb-2">
                    <span className="material-icons text-amber-600 mr-2">psychology</span>
                    <span className="font-medium">Stress Management</span>
                  </div>
                  <p className="text-sm text-neutral-dark mb-3">Introduce 15-minute daily mindfulness sessions to help reduce stress levels during high-pressure periods.</p>
                  <button className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-md">
                    Resources
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};