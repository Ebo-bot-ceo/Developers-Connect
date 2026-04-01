import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Link, 
  useParams, 
  useNavigate 
} from 'react-router-dom';
import { 
  auth, db, storage 
} from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  arrayUnion, 
  serverTimestamp,
  Timestamp,
  getDocFromServer,
  where,
  deleteDoc,
  collectionGroup
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';
import { 
  Trophy, 
  Users, 
  Code, 
  Rocket, 
  Plus, 
  LogOut, 
  Github, 
  ExternalLink, 
  ChevronRight,
  Layout,
  MessageSquare,
  Globe,
  Zap,
  CheckCircle2,
  AlertCircle,
  Filter,
  Calendar,
  Mail,
  Link as LinkIcon,
  UserPlus,
  X,
  Check,
  Share2,
  Copy,
  Lock as LockIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

// --- Types ---
interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  teamId?: string;
}

interface Team {
  id: string;
  name: string;
  members: string[];
  invitedEmails?: string[];
  projectId?: string;
}

interface Project {
  id: string;
  title: string;
  description: string;
  demoUrl?: string;
  techStack?: string[];
  challenges?: string;
  learnings?: string;
  teamId: string;
  imageUrl?: string;
  visibility: 'public' | 'private';
  status: 'planning' | 'in-progress' | 'completed' | 'demoed';
  createdAt: Timestamp;
}

interface Invitation {
  id: string;
  teamId: string;
  teamName: string;
  email?: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

// --- Context ---
interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// --- Error Handler ---
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        const parsed = JSON.parse(event.message);
        if (parsed.error) {
          setError(`Database Error: ${parsed.error}`);
        }
      } catch {
        setError(event.message);
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (error) {
    return (
      <div className="fixed bottom-4 right-4 bg-red-500 text-white p-4 rounded-lg shadow-lg z-50 flex items-center gap-3">
        <AlertCircle size={20} />
        <div>
          <p className="font-bold">Something went wrong</p>
          <p className="text-sm opacity-90">{error}</p>
        </div>
        <button onClick={() => setError(null)} className="ml-4 underline text-sm">Dismiss</button>
      </div>
    );
  }

  return <>{children}</>;
};

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useContext(AuthContext);
  const [project, setProject] = useState<Project | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const updateStatus = async (newStatus: Project['status']) => {
    if (!id || !project) return;
    setIsUpdatingStatus(true);
    try {
      await updateDoc(doc(db, 'projects', id), { status: newStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `projects/${id}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const isTeamMember = profile && team?.members.includes(profile.uid);

  useEffect(() => {
    if (!id) return;

    const unsub = onSnapshot(doc(db, 'projects', id), async (snapshot) => {
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() } as Project;
        setProject(data);
        
        // Fetch team info
        const teamSnap = await getDoc(doc(db, 'teams', data.teamId));
        if (teamSnap.exists()) {
          setTeam({ id: teamSnap.id, ...teamSnap.data() } as Team);
        }
      }
      setLoading(false);
    }, (err) => {
      if (err.message.includes('permission-denied')) {
        setProject(null);
        setLoading(false);
      } else {
        handleFirestoreError(err, OperationType.GET, `projects/${id}`);
      }
    });

    return () => unsub();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-black border-t-orange-600 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex flex-col items-center justify-center gap-4 p-4 text-center">
        <AlertCircle size={48} className="text-red-500" />
        <h2 className="text-2xl font-black uppercase">Access Denied or Not Found</h2>
        <p className="font-bold text-zinc-600 max-w-md">
          This project might be private or doesn't exist. Only team members and invited users can view private projects.
        </p>
        <button onClick={() => navigate('/')} className="bg-black text-white px-8 py-3 font-bold uppercase hover:bg-zinc-800 transition-colors">
          Go Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#f5f5f5] min-h-screen pb-20">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <button 
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 font-bold uppercase text-sm hover:underline"
        >
          <ChevronRight className="rotate-180" size={16} /> Back to Showcase
        </button>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border-2 border-black p-8 sm:p-12 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-12">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <h1 className="text-4xl sm:text-6xl font-black uppercase leading-none tracking-tighter">{project.title}</h1>
                {project.visibility === 'private' && (
                  <span className="bg-zinc-100 text-zinc-500 text-xs font-black uppercase px-2 py-1 border border-zinc-200 flex items-center gap-2">
                    <LockIcon size={12} /> Private
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {project.techStack?.map(tech => (
                  <span key={tech} className="bg-zinc-100 border border-black px-3 py-1 text-xs font-bold uppercase">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
            {project.demoUrl && (
              <a 
                href={project.demoUrl} 
                target="_blank" 
                rel="noreferrer"
                className="bg-orange-600 text-white px-8 py-4 font-bold uppercase flex items-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:-translate-y-1 transition-transform"
              >
                Live Demo <ExternalLink size={20} />
              </a>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="md:col-span-2 space-y-12">
              {project.imageUrl && (
                <div className="border-2 border-black overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                  <img 
                    src={project.imageUrl} 
                    alt={project.title} 
                    className="w-full h-auto object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <section>
                <h2 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest">Project Description</h2>
                <div className="prose prose-lg max-w-none">
                  <Markdown>{project.description}</Markdown>
                </div>
              </section>

              {project.challenges && (
                <section>
                  <h2 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest">Challenges Overcome</h2>
                  <div className="bg-zinc-50 border-l-4 border-black p-6 italic text-zinc-700">
                    {project.challenges}
                  </div>
                </section>
              )}

              {project.learnings && (
                <section>
                  <h2 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest">Key Learnings</h2>
                  <div className="bg-zinc-50 border-l-4 border-orange-600 p-6 italic text-zinc-700">
                    {project.learnings}
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-8">
              <div className="border-2 border-black p-6 bg-zinc-50">
                <h3 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest">Project Status</h3>
                <div className="flex flex-col gap-4">
                  <div className={`px-4 py-2 text-sm font-black uppercase border-2 border-black text-center ${
                    project.status === 'completed' ? 'bg-green-500 text-white' :
                    project.status === 'in-progress' ? 'bg-blue-500 text-white' :
                    project.status === 'demoed' ? 'bg-orange-500 text-white' :
                    'bg-zinc-200 text-zinc-600'
                  }`}>
                    {project.status.replace('-', ' ')}
                  </div>
                  {isTeamMember && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase text-zinc-400">Update Status</p>
                      <div className="grid grid-cols-2 gap-2">
                        {['planning', 'in-progress', 'completed', 'demoed'].map((s) => (
                          <button
                            key={s}
                            onClick={() => updateStatus(s as Project['status'])}
                            disabled={isUpdatingStatus || project.status === s}
                            className={`text-[10px] font-black uppercase p-2 border border-black transition-colors ${
                              project.status === s ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'
                            } disabled:opacity-50`}
                          >
                            {s.replace('-', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-2 border-black p-6 bg-zinc-50">
                <h3 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest">The Team</h3>
                {team ? (
                  <div className="space-y-4">
                    <p className="text-xl font-bold">{team.name}</p>
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase text-zinc-400">Members</p>
                      <div className="flex flex-col gap-2">
                        {team.members.map((m, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm font-bold">
                            <div className="w-2 h-2 bg-black rounded-full" />
                            Participant {i + 1}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm italic text-zinc-500">Team info unavailable</p>
                )}
              </div>

              <div className="border-2 border-black p-6">
                <h3 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest">Submission Date</h3>
                <p className="font-bold">{project.createdAt?.toDate().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const Navbar = () => {
  const { user, signIn, logout } = useAuth();

  return (
    <nav className="border-b border-black bg-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-2">
            <div className="bg-black text-white p-1">
              <Code size={24} />
            </div>
            <span className="font-bold text-xl tracking-tighter uppercase">Developers Connect</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-black" referrerPolicy="no-referrer" />
                <button 
                  onClick={logout}
                  className="flex items-center gap-2 text-sm font-bold uppercase hover:underline"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            ) : (
              <button 
                onClick={signIn}
                className="bg-black text-white px-6 py-2 font-bold uppercase hover:bg-zinc-800 transition-colors"
              >
                Join Hackathon
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

const Landing = () => {
  const { signIn } = useAuth();

  return (
    <div className="bg-[#E4E3E0] min-h-screen">
      <section className="max-w-7xl mx-auto px-4 py-20 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-8"
        >
          <h1 className="text-7xl sm:text-8xl font-black uppercase leading-[0.85] tracking-tighter">
            Build <br />
            The <br />
            <span className="text-orange-600 italic">Future</span>
          </h1>
          <p className="text-xl font-medium max-w-md leading-relaxed">
            Developers Connect is a global hackathon where coders, designers, and innovators come together to create impactful solutions.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={signIn}
              className="bg-black text-white px-8 py-4 font-bold uppercase text-lg flex items-center gap-2 hover:translate-x-1 hover:-translate-y-1 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-0 active:translate-y-0"
            >
              Start Building <ChevronRight />
            </button>
          </div>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative"
        >
          <div className="aspect-square bg-white border-2 border-black p-8 shadow-[12px_12px_0px_0px_rgba(242,125,38,1)]">
            <div className="grid grid-cols-2 gap-4 h-full">
              <div className="bg-zinc-100 border border-black p-4 flex flex-col justify-between">
                <Trophy className="text-orange-600" size={32} />
                <span className="font-bold uppercase text-xs">Global Recognition</span>
              </div>
              <div className="bg-black text-white border border-black p-4 flex flex-col justify-between">
                <Users size={32} />
                <span className="font-bold uppercase text-xs">Team Collaboration</span>
              </div>
              <div className="bg-zinc-100 border border-black p-4 flex flex-col justify-between">
                <Globe className="text-blue-600" size={32} />
                <span className="font-bold uppercase text-xs">Worldwide Impact</span>
              </div>
              <div className="bg-zinc-100 border border-black p-4 flex flex-col justify-between">
                <Zap className="text-yellow-500" size={32} />
                <span className="font-bold uppercase text-xs">Rapid Innovation</span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="border-y border-black bg-white py-12 overflow-hidden">
        <div className="flex whitespace-nowrap animate-marquee">
          {[...Array(10)].map((_, i) => (
            <span key={i} className="text-4xl font-black uppercase mx-8 flex items-center gap-4">
              <Rocket className="text-orange-600" /> Developers Connect 2026
            </span>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-24 border-t border-black">
        <div className="grid lg:grid-cols-2 gap-16">
          <div>
            <h2 className="text-4xl font-black uppercase italic mb-8">About the Challenge</h2>
            <div className="space-y-6 text-lg text-zinc-700 leading-relaxed">
              <p>
                Developers Connect is a global hackathon where coders, designers, and innovators come together to create impactful solutions. This challenge is all about collaboration, creativity, and building projects that solve real-world problems using technology.
              </p>
              <ul className="space-y-4">
                <li className="flex gap-4">
                  <div className="bg-orange-600 text-white w-8 h-8 flex items-center justify-center font-bold shrink-0">1</div>
                  <p><span className="font-bold text-black">Collaborate</span> with diverse teams across the world.</p>
                </li>
                <li className="flex gap-4">
                  <div className="bg-orange-600 text-white w-8 h-8 flex items-center justify-center font-bold shrink-0">2</div>
                  <p><span className="font-bold text-black">Innovate</span> by designing, coding, and deploying practical solutions.</p>
                </li>
                <li className="flex gap-4">
                  <div className="bg-orange-600 text-white w-8 h-8 flex items-center justify-center font-bold shrink-0">3</div>
                  <p><span className="font-bold text-black">Showcase</span> your skills to industry experts and peers.</p>
                </li>
              </ul>
            </div>
          </div>
          <div className="bg-black text-white p-12 flex flex-col justify-center">
            <h3 className="text-3xl font-black uppercase italic mb-6">Requirements</h3>
            <p className="text-zinc-400 mb-8">Build anything that leverages technology to solve real-world problems or create innovative experiences.</p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold uppercase text-orange-600 text-sm mb-2">Web & Mobile</h4>
                <p className="text-xs text-zinc-500">Tools and services that improve everyday life.</p>
              </div>
              <div>
                <h4 className="font-bold uppercase text-orange-600 text-sm mb-2">AI & ML</h4>
                <p className="text-xs text-zinc-500">Smart assistants and data-driven solutions.</p>
              </div>
              <div>
                <h4 className="font-bold uppercase text-orange-600 text-sm mb-2">APIs</h4>
                <p className="text-xs text-zinc-500">Integrations and utilities using existing APIs.</p>
              </div>
              <div>
                <h4 className="font-bold uppercase text-orange-600 text-sm mb-2">Games</h4>
                <p className="text-xs text-zinc-500">Engaging and interactive digital experiences.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-24">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="border-2 border-black p-8 bg-white hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-shadow">
            <h3 className="text-2xl font-black uppercase mb-4 italic">Collaborate</h3>
            <p className="text-zinc-600">Form diverse teams across the world. Share ideas, split tasks, and build together in real-time.</p>
          </div>
          <div className="border-2 border-black p-8 bg-white hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-shadow">
            <h3 className="text-2xl font-black uppercase mb-4 italic">Innovate</h3>
            <p className="text-zinc-600">Design, code, and deploy practical solutions. Whether it's AI, Web, or Mobile, your creativity is the limit.</p>
          </div>
          <div className="border-2 border-black p-8 bg-white hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-shadow">
            <h3 className="text-2xl font-black uppercase mb-4 italic">Showcase</h3>
            <p className="text-zinc-600">Present your working prototype to industry experts and a global community of developers.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

const Dashboard = () => {
  const { profile } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [projectData, setProjectData] = useState({
    title: '',
    description: '',
    demoUrl: '',
    techStack: '',
    challenges: '',
    learnings: '',
    imageUrl: '',
    visibility: 'public' as 'public' | 'private',
    status: 'planning' as 'planning' | 'in-progress' | 'completed' | 'demoed'
  });

  const [myInvitations, setMyInvitations] = useState<Invitation[]>([]);

  useEffect(() => {
    if (!profile?.email) return;
    const q = query(collectionGroup(db, 'invitations'), where('email', '==', profile.email), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snapshot) => {
      setMyInvitations(snapshot.docs.map(doc => {
        const teamId = doc.ref.parent.parent?.id || '';
        return { id: doc.id, teamId, ...doc.data() } as Invitation;
      }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'invitations'));
    return () => unsub();
  }, [profile?.email]);

  const [invitedProjects, setInvitedProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (myInvitations.length === 0) {
      setInvitedProjects([]);
      return;
    }
    
    // Fetch projects for each invited team
    const unsubscribes = myInvitations.map(inv => {
      const q = query(collection(db, 'projects'), where('teamId', '==', inv.teamId));
      return onSnapshot(q, (snapshot) => {
        const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        setInvitedProjects(prev => {
          const other = prev.filter(p => p.teamId !== inv.teamId);
          return [...other, ...projects];
        });
      }, (err) => handleFirestoreError(err, OperationType.LIST, `projects for team ${inv.teamId}`));
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [myInvitations]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  const [selectedTech, setSelectedTech] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'title' | 'team'>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  // Map team IDs to names for easy lookup
  const teamMap = useMemo(() => {
    const map: Record<string, string> = {};
    allTeams.forEach(t => {
      map[t.id] = t.name;
    });
    return map;
  }, [allTeams]);

  // Extract unique tech tags
  const uniqueTech = useMemo(() => {
    const tags = new Set<string>();
    allProjects.forEach(p => {
      p.techStack?.forEach(t => tags.add(t));
    });
    return ['All', ...Array.from(tags).sort()];
  }, [allProjects]);

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let filtered = [...allProjects];

    // Add user's own project if it's private and not already in the list
    if (project && project.visibility === 'private' && !filtered.find(p => p.id === project.id)) {
      filtered.push(project);
    }

    // Add projects user is invited to
    invitedProjects.forEach(p => {
      if (!filtered.find(fp => fp.id === p.id)) {
        filtered.push(p);
      }
    });

    if (selectedTech !== 'All') {
      filtered = filtered.filter(p => p.techStack?.includes(selectedTech));
    }

    if (selectedStatus !== 'All') {
      filtered = filtered.filter(p => p.status === selectedStatus);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(query) || 
        p.description.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => {
      if (sortOrder === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (sortOrder === 'team') {
        const teamA = teamMap[a.teamId] || '';
        const teamB = teamMap[b.teamId] || '';
        return teamA.localeCompare(teamB);
      }
      const dateA = a.createdAt?.toMillis() || 0;
      const dateB = b.createdAt?.toMillis() || 0;
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return filtered;
  }, [allProjects, project, invitedProjects, selectedTech, selectedStatus, sortOrder, teamMap, searchQuery]);

  useEffect(() => {
    if (profile?.teamId) {
      const unsub = onSnapshot(doc(db, 'teams', profile.teamId), (snapshot) => {
        if (snapshot.exists()) {
          setTeam({ id: snapshot.id, ...snapshot.data() } as Team);
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, `teams/${profile.teamId}`));
      return () => unsub();
    } else {
      setTeam(null);
    }
  }, [profile?.teamId]);

  useEffect(() => {
    if (team?.projectId) {
      const unsub = onSnapshot(doc(db, 'projects', team.projectId), (snapshot) => {
        if (snapshot.exists()) {
          setProject({ id: snapshot.id, ...snapshot.data() } as Project);
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, `projects/${team.projectId}`));
      return () => unsub();
    } else {
      setProject(null);
    }
  }, [team?.projectId]);

  useEffect(() => {
    const q = query(
      collection(db, 'projects'), 
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setAllProjects(projects);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'projects'));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'teams'), (snapshot) => {
      const teams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      setAllTeams(teams);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'teams'));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (team?.id) {
      const q = query(collection(db, 'teams', team.id, 'invitations'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snapshot) => {
        setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invitation)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, `teams/${team.id}/invitations`));
      return () => unsub();
    } else {
      setInvitations([]);
    }
  }, [team?.id]);

  const createTeam = async () => {
    if (!profile || !teamName.trim()) return;
    try {
      const teamRef = doc(collection(db, 'teams'));
      const newTeam = {
        id: teamRef.id,
        name: teamName,
        members: [profile.uid],
        invitedEmails: []
      };
      await setDoc(teamRef, newTeam);
      await updateDoc(doc(db, 'users', profile.uid), { teamId: teamRef.id });
      setIsCreatingTeam(false);
      setTeamName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'teams');
    }
  };

  const submitProject = async () => {
    if (!profile?.teamId || !projectData.title.trim() || !projectData.description.trim()) return;
    setIsUploading(true);
    try {
      let finalImageUrl = projectData.imageUrl;

      if (imageFile) {
        const fileRef = ref(storage, `projects/${profile.teamId}/${Date.now()}_${imageFile.name}`);
        await uploadBytes(fileRef, imageFile);
        finalImageUrl = await getDownloadURL(fileRef);
      }

      const techStackArray = typeof projectData.techStack === 'string' 
        ? projectData.techStack.split(',').map(s => s.trim()).filter(Boolean)
        : projectData.techStack;

      if (isEditing && team?.projectId) {
        const projectRef = doc(db, 'projects', team.projectId);
        await updateDoc(projectRef, {
          ...projectData,
          imageUrl: finalImageUrl,
          techStack: techStackArray,
        });
      } else {
        const projectRef = doc(collection(db, 'projects'));
        const newProject = {
          ...projectData,
          id: projectRef.id,
          imageUrl: finalImageUrl,
          techStack: techStackArray,
          teamId: profile.teamId,
          status: projectData.status,
          createdAt: serverTimestamp()
        };
        await setDoc(projectRef, newProject);
        await updateDoc(doc(db, 'teams', profile.teamId), { projectId: projectRef.id });
      }
      setIsSubmittingProject(false);
      setIsEditing(false);
      setImageFile(null);
      setProjectData({ title: '', description: '', demoUrl: '', techStack: '', challenges: '', learnings: '', imageUrl: '', visibility: 'public', status: 'planning' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'projects');
    } finally {
      setIsUploading(false);
    }
  };

  const openEditModal = () => {
    if (!project) return;
    setProjectData({
      title: project.title,
      description: project.description,
      demoUrl: project.demoUrl || '',
      techStack: project.techStack?.join(', ') || '',
      challenges: project.challenges || '',
      learnings: project.learnings || '',
      imageUrl: project.imageUrl || '',
      visibility: project.visibility || 'public',
      status: project.status || 'planning'
    });
    setIsEditing(true);
    setIsSubmittingProject(true);
  };

  const sendInvite = async (email?: string) => {
    if (!team || !profile) return;
    try {
      const invId = email ? `${email.replace(/[^a-zA-Z0-9]/g, '_')}_${team.id}` : doc(collection(db, 'teams', team.id, 'invitations')).id;
      const invRef = doc(db, 'teams', team.id, 'invitations', invId);
      const newInv = {
        id: invId,
        invitedBy: profile.uid,
        status: 'pending',
        createdAt: serverTimestamp(),
        teamName: team.name,
        teamId: team.id,
        ...(email && { email })
      };
      await setDoc(invRef, newInv);
      if (email) {
        await updateDoc(doc(db, 'teams', team.id), {
          invitedEmails: arrayUnion(email)
        });
      } else {
        setInviteLink(`${window.location.origin}/join/${team.id}/${invRef.id}`);
      }
      setInviteEmail('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `teams/${team.id}/invitations`);
    }
  };

  const respondToInvite = async (invitation: Invitation, status: 'accepted' | 'declined') => {
    if (!profile) return;
    try {
      const invRef = doc(db, 'teams', invitation.teamId, 'invitations', invitation.id);
      await updateDoc(invRef, { status });
      
      if (invitation.email) {
        const { arrayRemove } = await import('firebase/firestore');
        await updateDoc(doc(db, 'teams', invitation.teamId), {
          invitedEmails: arrayRemove(invitation.email)
        });
      }

      if (status === 'accepted') {
        await updateDoc(doc(db, 'teams', invitation.teamId), {
          members: arrayUnion(profile.uid)
        });
        await updateDoc(doc(db, 'users', profile.uid), { teamId: invitation.teamId });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `teams/${invitation.teamId}/invitations/${invitation.id}`);
    }
  };

  const cancelInvite = async (invitation: Invitation) => {
    if (!team) return;
    try {
      await deleteDoc(doc(db, 'teams', team.id, 'invitations', invitation.id));
      if (invitation.email) {
        const { arrayRemove } = await import('firebase/firestore');
        await updateDoc(doc(db, 'teams', team.id), {
          invitedEmails: arrayRemove(invitation.email)
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `teams/${team.id}/invitations/${invitation.id}`);
    }
  };

  return (
    <div className="bg-[#f5f5f5] min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Sidebar / Team Info */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border-2 border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <h2 className="text-xl font-black uppercase mb-4 flex items-center gap-2">
                <Users size={20} /> My Team
              </h2>
              {team ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-zinc-400">Team Name</p>
                    <p className="text-lg font-bold">{team.name}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold uppercase text-zinc-400">Members ({team.members.length}/10)</p>
                      {team.members.length < 10 && (
                        <button 
                          onClick={() => setIsInviting(true)}
                          className="text-[10px] font-black uppercase text-orange-600 hover:underline flex items-center gap-1"
                        >
                          <UserPlus size={12} /> Invite
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {team.members.map(m => (
                        <div key={m} className="bg-zinc-100 px-2 py-1 text-xs font-bold border border-black">
                          {m === profile?.uid ? 'You' : 'Member'}
                        </div>
                      ))}
                    </div>
                  </div>

                  {invitations.length > 0 && (
                    <div className="pt-4 border-t border-zinc-100">
                      <p className="text-xs font-bold uppercase text-zinc-400 mb-2">Pending Invites</p>
                      <div className="space-y-2">
                        {invitations.filter(i => i.status === 'pending').map(inv => (
                          <div key={inv.id} className="flex items-center justify-between text-[10px] bg-zinc-50 p-2 border border-zinc-200">
                            <span className="font-bold truncate max-w-[120px]">{inv.email || 'Share Link'}</span>
                            <button 
                              onClick={() => cancelInvite(inv)}
                              className="text-red-600 hover:underline font-black uppercase"
                            >
                              Cancel
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-zinc-500 text-sm italic">You haven't joined or created a team yet.</p>
                  {isCreatingTeam ? (
                    <div className="space-y-2">
                      <input 
                        type="text" 
                        placeholder="Team Name"
                        className="w-full border-2 border-black p-2 font-bold focus:outline-none"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button 
                          onClick={createTeam}
                          className="flex-1 bg-black text-white py-2 font-bold uppercase text-sm"
                        >
                          Confirm
                        </button>
                        <button 
                          onClick={() => setIsCreatingTeam(false)}
                          className="flex-1 border-2 border-black py-2 font-bold uppercase text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsCreatingTeam(true)}
                      className="w-full bg-black text-white py-3 font-bold uppercase flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Create Team
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white border-2 border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <h2 className="text-xl font-black uppercase mb-4 flex items-center gap-2">
                <Rocket size={20} /> My Project
              </h2>
              {project ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">{project.title}</h3>
                    <CheckCircle2 className="text-green-600" size={20} />
                  </div>
                  <p className="text-sm text-zinc-600 line-clamp-3">{project.description}</p>
                  <div className="flex flex-col gap-2">
                    {project.demoUrl && (
                      <a 
                        href={project.demoUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full bg-zinc-100 border border-black py-2 text-xs font-bold uppercase flex items-center justify-center gap-1 hover:bg-zinc-200 transition-colors"
                      >
                        <ExternalLink size={14} /> Demo
                      </a>
                    )}
                    <button 
                      onClick={openEditModal}
                      className="w-full bg-black text-white py-2 text-xs font-bold uppercase flex items-center justify-center gap-1 hover:bg-zinc-800 transition-colors"
                    >
                      Edit Project
                    </button>
                  </div>
                </div>
              ) : team ? (
                <div className="space-y-4">
                  <p className="text-zinc-500 text-sm italic">Ready to submit your masterpiece?</p>
                  <button 
                    onClick={() => setIsSubmittingProject(true)}
                    className="w-full bg-orange-600 text-white py-3 font-bold uppercase flex items-center justify-center gap-2"
                  >
                    <Plus size={18} /> Submit Project
                  </button>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm italic">Create a team first to submit a project.</p>
              )}
            </div>
          </div>

          {/* Main Content / Showcase */}
          <div className="lg:col-span-2 space-y-8">
            {/* My Invitations */}
            {myInvitations.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-zinc-900 border-2 border-black p-6 text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
              >
                <div className="flex items-center gap-4 mb-4">
                  <Mail className="text-orange-600" size={24} />
                  <h3 className="text-xl font-black uppercase italic">Pending Invitations</h3>
                </div>
                <div className="space-y-4">
                  {myInvitations.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between bg-zinc-800 p-4 border border-zinc-700">
                      <div>
                        <p className="font-bold">Team: <span className="text-orange-600">{inv.teamName}</span></p>
                        <p className="text-xs text-zinc-400">Invited on {inv.createdAt?.toDate().toLocaleDateString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => respondToInvite(inv, 'accepted')}
                          className="bg-orange-600 text-white px-4 py-2 text-xs font-black uppercase hover:bg-orange-700 transition-colors flex items-center gap-1"
                        >
                          <Check size={14} /> Accept
                        </button>
                        <button 
                          onClick={() => respondToInvite(inv, 'declined')}
                          className="bg-zinc-700 text-white px-4 py-2 text-xs font-black uppercase hover:bg-zinc-600 transition-colors flex items-center gap-1"
                        >
                          <X size={14} /> Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {team && !project && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-orange-600 border-2 border-black p-8 text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
              >
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center md:text-left">
                    <h3 className="text-2xl font-black uppercase italic">Ready to Showcase?</h3>
                    <p className="font-bold text-orange-100">Your team "{team.name}" is ready! Submit your project now to join the showcase.</p>
                  </div>
                  <button 
                    onClick={() => setIsSubmittingProject(true)}
                    className="bg-black text-white px-8 py-4 font-black uppercase hover:translate-x-1 hover:-translate-y-1 transition-transform shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)] active:shadow-none active:translate-x-0 active:translate-y-0 shrink-0"
                  >
                    Submit Project
                  </button>
                </div>
              </motion.div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-3xl font-black uppercase italic">Project Showcase</h2>
              <div className="text-xs font-bold uppercase bg-black text-white px-2 py-1 self-start sm:self-auto">
                {filteredProjects.length} {filteredProjects.length === 1 ? 'Submission' : 'Submissions'}
              </div>
            </div>

            {/* Search and Filters */}
            <div className="space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search projects by title or keywords..."
                  className="w-full border-2 border-black p-4 font-bold focus:outline-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:shadow-[8px_8px_0px_0px_rgba(242,125,38,1)] transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              <div className="bg-white border-2 border-black p-4 flex flex-wrap gap-4 items-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-zinc-400" />
                <span className="text-[10px] font-black uppercase">Tech:</span>
                <select 
                  value={selectedTech}
                  onChange={(e) => setSelectedTech(e.target.value)}
                  className="text-[10px] font-bold uppercase border border-black px-2 py-1 focus:outline-none bg-zinc-50"
                >
                  {uniqueTech.map(tech => (
                    <option key={tech} value={tech}>{tech}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Filter size={16} className="text-zinc-400" />
                <span className="text-[10px] font-black uppercase">Status:</span>
                <select 
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="text-[10px] font-bold uppercase border border-black px-2 py-1 focus:outline-none bg-zinc-50"
                >
                  <option value="All">All Status</option>
                  <option value="planning">Planning</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="demoed">Demoed</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-zinc-400" />
                <span className="text-[10px] font-black uppercase">Sort:</span>
                <select 
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'title' | 'team')}
                  className="text-[10px] font-bold uppercase border border-black px-2 py-1 focus:outline-none bg-zinc-50"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="title">Title (A-Z)</option>
                  <option value="team">Team Name (A-Z)</option>
                </select>
              </div>

              {(selectedTech !== 'All' || selectedStatus !== 'All' || sortOrder !== 'newest' || searchQuery !== '') && (
                <button 
                  onClick={() => {
                    setSelectedTech('All');
                    setSelectedStatus('All');
                    setSortOrder('newest');
                    setSearchQuery('');
                  }}
                  className="text-[10px] font-black uppercase text-orange-600 hover:underline ml-auto"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

            <div className="grid gap-6">
              <AnimatePresence mode="popLayout">
                {filteredProjects.length > 0 ? (
                  filteredProjects.map((p) => (
                    <motion.div 
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white border-2 border-black hover:shadow-[8px_8px_0px_0px_rgba(242,125,38,1)] transition-shadow group overflow-hidden"
                    >
                      {p.imageUrl && (
                        <div className="h-48 border-b-2 border-black overflow-hidden">
                          <img 
                            src={p.imageUrl} 
                            alt={p.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <Link to={`/project/${p.id}`} className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-2xl font-black uppercase tracking-tight group-hover:text-orange-600 transition-colors">{p.title}</h3>
                              {p.visibility === 'private' && (
                                <span className="bg-zinc-100 text-zinc-500 text-[8px] font-black uppercase px-1.5 py-0.5 border border-zinc-200 flex items-center gap-1">
                                  <LockIcon size={8} /> Private
                                </span>
                              )}
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 border border-black ${
                                p.status === 'completed' ? 'bg-green-100 text-green-700' :
                                p.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                                p.status === 'demoed' ? 'bg-orange-100 text-orange-700' :
                                'bg-zinc-100 text-zinc-700'
                              }`}>
                                {p.status.replace('-', ' ')}
                              </span>
                            </div>
                            <p className="text-[10px] font-black uppercase text-zinc-400 mt-1">By {teamMap[p.teamId] || 'Unknown Team'}</p>
                        <div className="flex gap-2 mt-2">
                          {p.techStack?.map(tech => (
                            <span key={tech} className="text-[10px] font-bold uppercase px-2 py-0.5 bg-zinc-100 border border-black">
                              {tech}
                            </span>
                          ))}
                        </div>
                      </Link>
                      <div className="flex gap-2">
                        {p.demoUrl && (
                          <a href={p.demoUrl} target="_blank" rel="noreferrer" className="p-2 border border-black hover:bg-black hover:text-white transition-colors">
                            <ExternalLink size={20} />
                          </a>
                        )}
                        <Link to={`/project/${p.id}`} className="p-2 border border-black hover:bg-black hover:text-white transition-colors">
                          <ChevronRight size={20} />
                        </Link>
                      </div>
                    </div>
                    <div className="prose prose-sm max-w-none text-zinc-600 line-clamp-2">
                      <Markdown>{p.description}</Markdown>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Link to={`/project/${p.id}`} className="text-[10px] font-black uppercase flex items-center gap-1 hover:underline">
                        View Details <ChevronRight size={12} />
                      </Link>
                    </div>
                  </div>
                </motion.div>
                ))
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white border-2 border-black p-12 text-center"
                >
                  <p className="text-zinc-500 font-bold uppercase italic">No projects found matching your filters.</p>
                  <button 
                    onClick={() => {
                      setSelectedTech('All');
                      setSortOrder('newest');
                    }}
                    className="mt-4 text-orange-600 font-black uppercase hover:underline"
                  >
                    Clear all filters
                  </button>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {isInviting && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border-4 border-black p-8 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black uppercase italic">Invite Member</h2>
                <button onClick={() => { setIsInviting(false); setInviteLink(''); }} className="hover:text-orange-600 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black uppercase mb-2">Invite via Email</label>
                  <div className="flex gap-2">
                    <input 
                      type="email" 
                      placeholder="developer@example.com"
                      className="flex-1 border-2 border-black p-3 font-bold focus:outline-none"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                    <button 
                      onClick={() => sendInvite(inviteEmail)}
                      disabled={!inviteEmail.trim()}
                      className="bg-black text-white px-4 font-black uppercase hover:bg-orange-600 transition-colors disabled:bg-zinc-400"
                    >
                      Send
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-zinc-300"></span>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase font-black">
                    <span className="bg-white px-2 text-zinc-400">Or</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase mb-2">Shareable Join Link</label>
                  {!inviteLink ? (
                    <button 
                      onClick={() => sendInvite()}
                      className="w-full border-2 border-black py-3 font-black uppercase flex items-center justify-center gap-2 hover:bg-zinc-50 transition-colors"
                    >
                      <Share2 size={18} /> Generate Link
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          readOnly
                          value={inviteLink}
                          className="flex-1 border-2 border-black p-3 font-mono text-[10px] bg-zinc-50"
                        />
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(inviteLink);
                          }}
                          className="bg-black text-white px-4 font-black uppercase hover:bg-orange-600 transition-colors"
                        >
                          <Copy size={18} />
                        </button>
                      </div>
                      <p className="text-[10px] text-green-600 font-bold uppercase">Link generated! Share it with your teammate.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Submission Modal */}
      <AnimatePresence>
        {isSubmittingProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsSubmittingProject(false);
                setIsEditing(false);
                setImageFile(null);
                setProjectData({ title: '', description: '', demoUrl: '', techStack: '', challenges: '', learnings: '', imageUrl: '', visibility: 'public', status: 'planning' });
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white border-2 border-black w-full max-w-2xl p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-y-auto max-h-[90vh]"
            >
              <h2 className="text-3xl font-black uppercase italic mb-8">
                {isEditing ? 'Edit Your Project' : 'Submit Your Project'}
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black uppercase mb-2">Project Title *</label>
                  <input 
                    type="text" 
                    className="w-full border-2 border-black p-3 font-bold focus:outline-none"
                    value={projectData.title}
                    onChange={(e) => setProjectData({...projectData, title: e.target.value})}
                    placeholder="e.g. EcoTrack AI"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase mb-2">Description (Markdown supported) *</label>
                  <textarea 
                    rows={4}
                    className="w-full border-2 border-black p-3 font-bold focus:outline-none"
                    value={projectData.description}
                    onChange={(e) => setProjectData({...projectData, description: e.target.value})}
                    placeholder="What does your project do? How does it solve a problem?"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase mb-2">Demo Link</label>
                    <input 
                      type="url" 
                      className="w-full border-2 border-black p-3 font-bold focus:outline-none"
                      value={projectData.demoUrl}
                      onChange={(e) => setProjectData({...projectData, demoUrl: e.target.value})}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase mb-2">Tech Stack (comma separated)</label>
                    <input 
                      type="text" 
                      className="w-full border-2 border-black p-3 font-bold focus:outline-none"
                      value={projectData.techStack}
                      onChange={(e) => setProjectData({...projectData, techStack: e.target.value})}
                      placeholder="React, Firebase, Tailwind"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase mb-2">Challenges Overcome</label>
                  <textarea 
                    rows={2}
                    className="w-full border-2 border-black p-3 font-bold focus:outline-none"
                    value={projectData.challenges}
                    onChange={(e) => setProjectData({...projectData, challenges: e.target.value})}
                    placeholder="What was the hardest part?"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase mb-2">Key Learnings</label>
                  <textarea 
                    rows={2}
                    className="w-full border-2 border-black p-3 font-bold focus:outline-none"
                    value={projectData.learnings}
                    onChange={(e) => setProjectData({...projectData, learnings: e.target.value})}
                    placeholder="What did you learn?"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase mb-2">Project Image</label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                        className="w-full border-2 border-black p-2 text-xs font-bold focus:outline-none file:mr-4 file:py-2 file:px-4 file:border-0 file:text-xs file:font-black file:uppercase file:bg-black file:text-white hover:file:bg-orange-600 cursor-pointer"
                      />
                    </div>
                    {(imageFile || projectData.imageUrl) && (
                      <div className="w-20 h-20 border-2 border-black overflow-hidden bg-zinc-100 shrink-0">
                        <img 
                          src={imageFile ? URL.createObjectURL(imageFile) : projectData.imageUrl} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase mb-2">Project Visibility</label>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setProjectData({...projectData, visibility: 'public'})}
                      className={`flex-1 p-3 border-2 border-black font-bold uppercase transition-colors ${projectData.visibility === 'public' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-50'}`}
                    >
                      Public
                    </button>
                    <button 
                      onClick={() => setProjectData({...projectData, visibility: 'private'})}
                      className={`flex-1 p-3 border-2 border-black font-bold uppercase transition-colors ${projectData.visibility === 'private' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-50'}`}
                    >
                      Private
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-2 uppercase font-bold">
                    {projectData.visibility === 'public' 
                      ? 'Anyone can view this project.' 
                      : 'Only team members and invited users can view this project.'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase mb-2">Project Status</label>
                  <select 
                    value={projectData.status}
                    onChange={(e) => setProjectData({...projectData, status: e.target.value as Project['status']})}
                    className="w-full p-3 border-2 border-black font-bold uppercase focus:outline-none focus:ring-2 focus:ring-orange-600"
                  >
                    <option value="planning">Planning</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="demoed">Demoed</option>
                  </select>
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={submitProject}
                    disabled={isUploading}
                    className="flex-1 bg-black text-white py-4 font-bold uppercase hover:bg-orange-600 transition-colors disabled:bg-zinc-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      isEditing ? 'Save Changes' : 'Submit Project'
                    )}
                  </button>
                  <button 
                    onClick={() => {
                      setIsSubmittingProject(false);
                      setIsEditing(false);
                      setImageFile(null);
                      setProjectData({ title: '', description: '', demoUrl: '', techStack: '', challenges: '', learnings: '', imageUrl: '', visibility: 'public', status: 'planning' });
                    }}
                    className="px-8 border-2 border-black py-4 font-bold uppercase hover:bg-zinc-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          const newProfile = {
            uid: u.uid,
            displayName: u.displayName || 'Anonymous',
            email: u.email || '',
            photoURL: u.photoURL || ''
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Login failed', err);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

const JoinTeam = () => {
  const { teamId, invitationId } = useParams();
  const { profile, signIn } = useAuth();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId || !invitationId) return;
    const fetchInv = async () => {
      try {
        const docRef = doc(db, 'teams', teamId, 'invitations', invitationId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setInvitation({ id: snap.id, teamId, ...snap.data() } as Invitation);
        } else {
          setError('Invitation not found or expired.');
        }
      } catch (err) {
        setError('Failed to fetch invitation.');
      } finally {
        setLoading(false);
      }
    };
    fetchInv();
  }, [teamId, invitationId]);

  const handleJoin = async () => {
    if (!profile || !invitation || !teamId) return;
    try {
      const invRef = doc(db, 'teams', teamId, 'invitations', invitation.id);
      await updateDoc(invRef, { status: 'accepted' });
      await updateDoc(doc(db, 'teams', teamId), {
        members: arrayUnion(profile.uid)
      });
      await updateDoc(doc(db, 'users', profile.uid), { teamId });
      navigate('/');
    } catch (err) {
      setError('Failed to join team.');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-black border-t-orange-600 animate-spin" />
        <span className="font-black uppercase tracking-widest text-sm">Checking invitation...</span>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-4">
      <div className="bg-white border-2 border-black p-12 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-center">
        <AlertCircle className="mx-auto mb-6 text-red-600" size={48} />
        <h2 className="text-3xl font-black uppercase italic mb-4">Error</h2>
        <p className="text-lg font-bold mb-8 text-red-600">{error}</p>
        <button 
          onClick={() => navigate('/')}
          className="w-full bg-black text-white py-4 font-black uppercase hover:bg-zinc-800 transition-colors"
        >
          Go Back Home
        </button>
      </div>
    </div>
  );

  if (!invitation) return null;

  return (
    <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-4">
      <div className="bg-white border-2 border-black p-12 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-center">
        <UserPlus className="mx-auto mb-6 text-orange-600" size={48} />
        <h2 className="text-3xl font-black uppercase italic mb-4">Join Team</h2>
        <p className="text-lg font-bold mb-8">
          You've been invited to join <span className="text-orange-600">"{invitation.teamName}"</span>
        </p>
        
        {!profile ? (
          <button 
            onClick={signIn}
            className="w-full bg-black text-white py-4 font-black uppercase hover:bg-zinc-800 transition-colors"
          >
            Sign in to Join
          </button>
        ) : (
          <div className="space-y-4">
            <button 
              onClick={handleJoin}
              className="w-full bg-black text-white py-4 font-black uppercase hover:bg-orange-600 transition-colors"
            >
              Accept Invitation
            </button>
            <button 
              onClick={() => navigate('/')}
              className="w-full border-2 border-black py-4 font-black uppercase hover:bg-zinc-100 transition-colors"
            >
              Decline
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-black border-t-orange-600 animate-spin" />
          <span className="font-black uppercase tracking-widest text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-orange-200 selection:text-orange-900">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={user ? <Dashboard /> : <Landing />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/join/:teamId/:invitationId" element={<JoinTeam />} />
        </Routes>
      </main>
      <footer className="bg-black text-white py-12 border-t border-black">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="bg-white text-black p-1">
                <Code size={20} />
              </div>
              <span className="font-bold text-lg tracking-tighter uppercase">Developers Connect</span>
            </div>
            <p className="text-zinc-400 text-sm">Empowering developers to build the next generation of impactful solutions.</p>
          </div>
          <div className="space-y-4">
            <h4 className="font-bold uppercase text-sm tracking-widest">Resources</h4>
            <ul className="text-zinc-400 text-sm space-y-2">
              <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-white transition-colors">API Reference</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Community Forum</a></li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-bold uppercase text-sm tracking-widest">Connect</h4>
            <div className="flex gap-4">
              <a href="#" className="p-2 border border-zinc-800 hover:border-white transition-colors"><Github size={20} /></a>
              <a href="#" className="p-2 border border-zinc-800 hover:border-white transition-colors"><Globe size={20} /></a>
              <a href="#" className="p-2 border border-zinc-800 hover:border-white transition-colors"><MessageSquare size={20} /></a>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 mt-12 pt-12 border-t border-zinc-900 text-center text-zinc-500 text-xs font-bold uppercase tracking-widest">
          © 2026 Developers Connect Global Hackathon. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
