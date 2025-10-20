'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, AlertCircle, Globe, ShoppingCart, FileText, Users, Building, Search, Zap, Database, Cpu, Package, Tag, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import config from '@/config/api.config';

interface SiteAnalysis {
  baseUrl: string;
  siteType: 'ecommerce' | 'blog' | 'news' | 'forum' | 'portfolio' | 'corporate' | 'directory';
  confidence: number;
  selectors: {
    title: string[];
    content: string[];
    price: string[];
    image: string[];
    link: string[];
    navigation: string[];
    pagination: string[];
  };
  ecommerce?: {
    productGrid: string[];
    productCard: string[];
    productName: string[];
    productPrice: string[];
    productImage: string[];
    productLink: string[];
    productSKU: string[];
    productRating: string[];
    addToCart: string[];
    cartCount: string[];
    checkout: string[];
  };
  entities: {
    products: boolean;
    articles: boolean;
    reviews: boolean;
    prices: boolean;
    dates: boolean;
    authors: boolean;
    categories: boolean;
  };
  technical: {
    cms: string;
    framework: string;
    hasStructuredData: boolean;
    microdataTypes: string[];
    hasOpenGraph: boolean;
    hasTwitterCards: boolean;
    language: string;
    paginationType: 'traditional' | 'infinite' | 'load-more' | 'none';
  };
  seo: {
    titleTemplate: string;
    metaDescription: string;
    h1Structure: string[];
    internalLinks: number;
    externalLinks: number;
    imagesWithAlt: number;
    totalImages: number;
  };
}

interface AnalysisProgress {
  step: string;
  progress: number;
  message: string;
  timestamp: Date;
}

interface SiteAnalyzerModalProps {
  open: boolean;
  onClose: () => void;
  onSiteCreated?: (site: any) => void;
  initialUrl?: string;
}

export default function SiteAnalyzerModal({ open, onClose, onSiteCreated, initialUrl = '' }: SiteAnalyzerModalProps) {
  const { toast } = useToast();
  const [url, setUrl] = useState(initialUrl);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [activeTab, setActiveTab] = useState('analysis');
  const [siteName, setSiteName] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (open && initialUrl) {
      setUrl(initialUrl);
      // Extract domain as default site name
      try {
        const domain = new URL(initialUrl).hostname.replace('www.', '');
        setSiteName(domain.charAt(0).toUpperCase() + domain.slice(1));
      } catch (error) {
        // Invalid URL
      }
    }
  }, [open, initialUrl]);

  const handleAnalyze = async () => {
    if (!url) {
      toast({
        title: 'Error',
        description: 'Please enter a valid URL',
        variant: 'destructive'
      });
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Please enter a valid URL (e.g., https://example.com)',
        variant: 'destructive'
      });
      return;
    }

    setIsAnalyzing(true);
    setProgress(null);
    setAnalysis(null);

    try {
      const token = localStorage.getItem('token');
      const fullUrl = `${config.api.baseUrl}/api/v2/scraper/sites/analyze-enhanced`;

      // First, start the analysis via POST request
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Since the response is Server-Sent Events, read it as text
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      // Process SSE stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.step) {
                setProgress(data);
              }

              if (data.type === 'complete') {
                setAnalysis(data.analysis);
                setIsAnalyzing(false);

                // Auto-generate category based on analysis
                if (data.analysis.siteType) {
                  setCategory(data.analysis.siteType);
                }

                toast({
                  title: 'Analysis Complete',
                  description: `Successfully analyzed ${new URL(url).hostname}`,
                });
                return;
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseError) {
              console.error('Failed to parse analysis data:', parseError);
            }
          }
        }
      }

    } catch (error) {
      console.error('Analysis error:', error);
      setIsAnalyzing(false);

      // Fallback to basic fetch if SSE fails
      try {
        const response = await fetch(`${config.api.baseUrl}/api/v2/scraper/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ url, useCache: true })
        });

        if (response.ok) {
          const result = await response.json();
          setAnalysis({
            baseUrl: url,
            siteType: 'website',
            confidence: 0.7,
            selectors: result.selectors || {},
            entities: {
              products: false,
              articles: true,
              reviews: false,
              prices: false,
              dates: true,
              authors: true,
              categories: true
            },
            technical: {
              cms: 'unknown',
              framework: 'unknown',
              hasStructuredData: false,
              microdataTypes: [],
              hasOpenGraph: false,
              hasTwitterCards: false,
              language: 'en',
              paginationType: 'traditional'
            },
            seo: {
              titleTemplate: '{title}',
              metaDescription: '',
              h1Structure: [],
              internalLinks: 0,
              externalLinks: 0,
              imagesWithAlt: 0,
              totalImages: 0
            }
          });

          setIsAnalyzing(false);
          toast({
            title: 'Analysis Complete',
            description: 'Successfully analyzed site with basic analysis',
          });
        } else {
          throw new Error('Basic analysis also failed');
        }
      } catch (fallbackError) {
        toast({
          title: 'Analysis Failed',
          description: error instanceof Error ? error.message : 'Failed to analyze site',
          variant: 'destructive'
        });
      }
    }
  };

  const handleCreateSite = async () => {
    if (!analysis || !siteName) {
      toast({
        title: 'Error',
        description: 'Please complete all required fields',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetch(`${config.api.baseUrl}/api/v2/scraper/sites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          name: siteName,
          baseUrl: url,
          type: analysis.siteType,
          category: category || 'general',
          selectors: analysis.selectors,
          active: true
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Success',
          description: 'Site created and configured successfully',
        });
        onSiteCreated?.(result.site);
        onClose();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to create site',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to create site:', error);
      toast({
        title: 'Error',
        description: 'Failed to create site',
        variant: 'destructive'
      });
    }
  };

  const getSiteTypeIcon = (type: string) => {
    switch (type) {
      case 'ecommerce': return <ShoppingCart className="h-5 w-5" />;
      case 'blog': return <FileText className="h-5 w-5" />;
      case 'news': return <FileText className="h-5 w-5" />;
      case 'forum': return <Users className="h-5 w-5" />;
      case 'corporate': return <Building className="h-5 w-5" />;
      default: return <Globe className="h-5 w-5" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Intelligent Site Analyzer
          </DialogTitle>
          <DialogDescription>
            Automatically analyze and configure websites for optimal scraping
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* URL Input */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="site-url">Website URL</Label>
              <div className="flex gap-2">
                <Input
                  id="site-url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isAnalyzing}
                />
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !url}
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Analyze
                </Button>
              </div>
            </div>

            {/* Progress */}
            {progress && (
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{progress.step.replace('_', ' ')}</span>
                      <span>{progress.progress}%</span>
                    </div>
                    <Progress value={progress.progress} className="w-full" />
                    <p className="text-sm text-muted-foreground">{progress.message}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {analysis && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
                <TabsTrigger value="selectors">Selectors</TabsTrigger>
                <TabsTrigger value="entities">Entities</TabsTrigger>
                <TabsTrigger value="technical">Technical</TabsTrigger>
              </TabsList>

              {/* Analysis Tab */}
              <TabsContent value="analysis" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Site Type */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {getSiteTypeIcon(analysis.siteType)}
                        Site Type
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-medium capitalize">{analysis.siteType}</span>
                          <Badge variant="outline">{analysis.confidence}% confidence</Badge>
                        </div>
                        <div className={`text-sm ${getConfidenceColor(analysis.confidence)}`}>
                          {analysis.confidence >= 0.8 ? 'High confidence detection' :
                           analysis.confidence >= 0.6 ? 'Medium confidence detection' :
                           'Low confidence detection'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Entity Detection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Detected Entities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {Object.entries(analysis.entities).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-sm capitalize">{key}</span>
                            {value ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* SEO Analysis */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="h-5 w-5" />
                      SEO Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{analysis.seo.internalLinks}</div>
                        <div className="text-sm text-muted-foreground">Internal Links</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{analysis.seo.externalLinks}</div>
                        <div className="text-sm text-muted-foreground">External Links</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{analysis.seo.totalImages}</div>
                        <div className="text-sm text-muted-foreground">Images</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{analysis.seo.imagesWithAlt}</div>
                        <div className="text-sm text-muted-foreground">With Alt Text</div>
                      </div>
                    </div>
                    {analysis.seo.metaDescription && (
                      <div className="mt-4">
                        <Label className="text-sm font-medium">Meta Description</Label>
                        <p className="text-sm text-muted-foreground mt-1">{analysis.seo.metaDescription}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Selectors Tab */}
              <TabsContent value="selectors" className="space-y-4">
                {/* Core Selectors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Core Selectors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(analysis.selectors).map(([key, selectors]) => (
                        <div key={key} className="space-y-2">
                          <Label className="text-sm font-medium capitalize">{key}</Label>
                          <div className="space-y-1">
                            {selectors.length > 0 ? (
                              selectors.map((selector, index) => (
                                <code key={index} className="block text-xs bg-muted p-1 rounded">
                                  {selector}
                                </code>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">Not detected</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* E-commerce Selectors */}
                {analysis.ecommerce && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        E-commerce Selectors
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(analysis.ecommerce).map(([key, selectors]) => (
                          <div key={key} className="space-y-2">
                            <Label className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
                            <div className="space-y-1">
                              {selectors.length > 0 ? (
                                selectors.map((selector, index) => (
                                  <code key={index} className="block text-xs bg-muted p-1 rounded">
                                    {selector}
                                  </code>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground">Not detected</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Entities Tab */}
              <TabsContent value="entities" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(analysis.entities).map(([key, detected]) => (
                    <Card key={key} className={detected ? 'border-green-200 bg-green-50' : 'border-gray-200'}>
                      <CardContent className="pt-4">
                        <div className="text-center">
                          <div className="mb-2">
                            {key === 'products' && <Package className="h-8 w-8 mx-auto" />}
                            {key === 'articles' && <FileText className="h-8 w-8 mx-auto" />}
                            {key === 'reviews' && <Users className="h-8 w-8 mx-auto" />}
                            {key === 'prices' && <Tag className="h-8 w-8 mx-auto" />}
                            {key === 'dates' && <Calendar className="h-8 w-8 mx-auto" />}
                            {key === 'authors' && <User className="h-8 w-8 mx-auto" />}
                            {key === 'categories' && <Database className="h-8 w-8 mx-auto" />}
                          </div>
                          <div className="font-medium capitalize">{key}</div>
                          <div className={`text-sm ${detected ? 'text-green-600' : 'text-gray-400'}`}>
                            {detected ? 'Detected' : 'Not Detected'}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Technical Tab */}
              <TabsContent value="technical" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Cpu className="h-5 w-5" />
                        Technology Stack
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm">CMS</span>
                          <Badge variant="outline">{analysis.technical.cms}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Framework</span>
                          <Badge variant="outline">{analysis.technical.framework}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Language</span>
                          <Badge variant="outline">{analysis.technical.language}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Pagination</span>
                          <Badge variant="outline">{analysis.technical.paginationType}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Structured Data
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm">Structured Data</span>
                          {analysis.technical.hasStructuredData ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Open Graph</span>
                          {analysis.technical.hasOpenGraph ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Twitter Cards</span>
                          {analysis.technical.hasTwitterCards ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                        {analysis.technical.microdataTypes.length > 0 && (
                          <div>
                            <span className="text-sm">Microdata Types:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {analysis.technical.microdataTypes.map((type, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {type.split('/').pop()}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Site Configuration */}
          {analysis && (
            <Card>
              <CardHeader>
                <CardTitle>Site Configuration</CardTitle>
                <CardDescription>
                  Configure the site settings before adding to your collection
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="site-name">Site Name</Label>
                    <Input
                      id="site-name"
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder="My Website"
                    />
                  </div>
                  <div>
                    <Label htmlFor="site-category">Category</Label>
                    <Input
                      id="site-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Category"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateSite}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Create Site
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}