import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, Switch, Progress, message, Tabs, Row, Col, Statistic, Alert } from 'antd';
import { PlayCircleOutlined, UploadOutlined, InfoCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

const Crawl4AIScraper = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [batchJobId, setBatchJobId] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [crawl4aiStatus, setCrawl4aiStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Crawl4AI durumunu kontrol et
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/v2/scraper/crawl4ai/status');
        const data = await response.json();
        
        if (data.success) {
          setCrawl4aiStatus(data.status);
        } else {
          setCrawl4aiStatus({ available: false, error: data.error });
        }
      } catch (error) {
        console.error('Status check error:', error);
        setCrawl4aiStatus({ available: false, error: 'Failed to check status' });
      } finally {
        setStatusLoading(false);
      }
    };

    checkStatus();
    // Her 30 saniyede bir durum kontrolü yap
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Tekli scraping
  const handleScrape = async (values) => {
    setLoading(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/v2/scraper/crawl4ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setResult(data.data);
        message.success('Scraping completed successfully');
      } else {
        message.error(`Scraping failed: ${data.error}`);
      }
    } catch (error) {
      message.error('Scraping failed');
      console.error('Scraping error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Toplu scraping
  const handleBatchScrape = async (values) => {
    const { urls, options, category } = values;
    
    if (!urls || urls.split('\n').filter(url => url.trim()).length === 0) {
      message.error('Please enter at least one URL');
      return;
    }
    
    setBatchLoading(true);
    setBatchJobId(null);
    setBatchProgress(null);
    
    try {
      const urlList = urls.split('\n').filter(url => url.trim());
      
      const response = await fetch('/api/v2/scraper/crawl4ai/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: urlList,
          options,
          category
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setBatchJobId(data.jobId);
        message.success(`Batch scraping started with ${data.totalUrls} URLs`);
        
        // İlerlemeyi takip et
        trackBatchProgress(data.jobId);
      } else {
        message.error(`Batch scraping failed: ${data.error}`);
      }
    } catch (error) {
      message.error('Batch scraping failed');
      console.error('Batch scraping error:', error);
    } finally {
      setBatchLoading(false);
    }
  };
  
  // Toplu scraping ilerleğini takip et
  const trackBatchProgress = (jobId) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v2/scraper/crawl4ai/job/${jobId}`);
        const data = await response.json();
        
        if (data.success) {
          setBatchProgress(data.job);
          
          if (data.job.status === 'completed' || data.job.status === 'failed') {
            clearInterval(interval);
            
            if (data.job.status === 'completed') {
              message.success('Batch scraping completed');
            } else {
              message.error(`Batch scraping failed: ${data.job.error}`);
            }
          }
        }
      } catch (error) {
        clearInterval(interval);
        console.error('Error tracking batch progress:', error);
      }
    }, 2000);
  };

  // Durum kartı
  const StatusCard = () => {
    if (statusLoading) {
      return (
        <Card loading title="Crawl4AI Status">
          <div style={{ height: 100 }}></div>
        </Card>
      );
    }

    if (!crawl4aiStatus || !crawl4aiStatus.available) {
      return (
        <Alert
          message="Crawl4AI Not Available"
          description={
            crawl4aiStatus?.error || 
            "Crawl4AI is not available. Please install Crawl4AI or start the API server."
          }
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          }
        />
      );
    }

    return (
      <Card title="Crawl4AI Status" extra={
        <Button size="small" icon={<InfoCircleOutlined />} onClick={() => window.location.reload()}>
          Refresh
        </Button>
      }>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="API Status"
              value={crawl4aiStatus.api ? "Available" : "Not Available"}
              valueStyle={{ color: crawl4aiStatus.api ? '#3f8600' : '#cf1322' }}
              prefix={crawl4aiStatus.api ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="CLI Status"
              value={crawl4aiStatus.cli ? "Available" : "Not Available"}
              valueStyle={{ color: crawl4aiStatus.cli ? '#3f8600' : '#cf1322' }}
              prefix={crawl4aiStatus.cli ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="Mode"
              value={crawl4aiStatus.api ? "API" : crawl4aiStatus.cli ? "CLI" : "None"}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
        </Row>
      </Card>
    );
  };
  
  return (
    <div>
      <StatusCard />
      
      <Card title="Crawl4AI Scraper" style={{ marginTop: 16 }}>
        <Tabs defaultActiveKey="single">
          <TabPane tab="Tekli Scraping" key="single">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleScrape}
              initialValues={{
                options: {
                  useJs: true,
                  extractText: true,
                  extractLinks: true
                },
                category: 'general',
                processContent: true,
                saveToDb: false,
                generateEmbeddings: false
              }}
            >
              <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url' }]}>
                <Input placeholder="https://example.com" />
              </Form.Item>
              
              <Form.Item name="category" label="Kategori">
                <Select>
                  <Option value="general">Genel</Option>
                  <Option value="legal">Yasal Mevzuat</Option>
                  <Option value="technical">Teknik Dokümantasyon</Option>
                  <Option value="news">Haberler ve Makaleler</Option>
                </Select>
              </Form.Item>
              
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="processContent" label="İçerik İşleme" valuePropName="checked">
                    <Switch checkedChildren="İşle" unCheckedChildren="İşleme" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="saveToDb" label="Veritabanı" valuePropName="checked">
                    <Switch checkedChildren="Kaydet" unCheckedChildren="Kaydetme" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="generateEmbeddings" label="Embeddings" valuePropName="checked">
                    <Switch checkedChildren="Oluştur" unCheckedChildren="Oluşturma" />
                  </Form.Item>
                </Col>
              </Row>
              
              <Form.Item name="options" label="Scraping Seçenekleri">
                <Card size="small">
                  <Form.Item name="useJs" valuePropName="checked">
                    <Switch checkedChildren="JS Kullan" unCheckedChildren="JS Kullanma" />
                  </Form.Item>
                  
                  <Form.Item name="extractText" valuePropName="checked">
                    <Switch checkedChildren="Metin Çıkar" unCheckedChildren="Metin Çıkarma" />
                  </Form.Item>
                  
                  <Form.Item name="extractLinks" valuePropName="checked">
                    <Switch checkedChildren="Linkleri Çıkar" unCheckedChildren="Linkleri Çıkarma" />
                  </Form.Item>
                  
                  <Form.Item name="waitForSelector" label="Wait For Selector">
                    <Input placeholder=".content" />
                  </Form.Item>
                  
                  <Form.Item name="cssSelector" label="CSS Selector">
                    <Input placeholder="article" />
                  </Form.Item>
                </Card>
              </Form.Item>
              
              <Form.Item>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={loading} 
                  icon={<PlayCircleOutlined />}
                  disabled={!crawl4aiStatus?.available}
                >
                  Scrape Et
                </Button>
              </Form.Item>
            </Form>
            
            {result && (
              <Card title="Scraping Sonucu" style={{ marginTop: 16 }}>
                <p><strong>Başlık:</strong> {result.title}</p>
                <p><strong>Açıklama:</strong> {result.description}</p>
                <p><strong>İçerik Uzunluğu:</strong> {result.content.length} karakter</p>
                <p><strong>Scraping Metodu:</strong> {result.metadata?.scrapingMethod}</p>
                
                {result.keywords && result.keywords.length > 0 && (
                  <div>
                    <strong>Anahtar Kelimeler:</strong>
                    <div>
                      {result.keywords.map(keyword => (
                        <span key={keyword} style={{ 
                          display: 'inline-block', 
                          margin: '4px', 
                          padding: '2px 8px', 
                          backgroundColor: '#f0f0f0', 
                          borderRadius: '4px' 
                        }}>
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {result.links && result.links.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <strong>Bulunan Linkler ({result.links.length}):</strong>
                    <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                      {result.links.slice(0, 10).map((link, index) => (
                        <div key={index} style={{ fontSize: '12px', color: '#666' }}>
                          {link}
                        </div>
                      ))}
                      {result.links.length > 10 && (
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          ... ve {result.links.length - 10} daha fazla
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {result.chunks && (
                  <p style={{ marginTop: 16 }}>
                    <strong>Oluşturulan Chunk'lar:</strong> {result.chunks.length}
                  </p>
                )}
                
                {result.embeddingsGenerated !== undefined && (
                  <p>
                    <strong>Oluşturulan Embedding'ler:</strong> {result.embeddingsGenerated}
                  </p>
                )}
                
                {result.savedToDb && (
                  <p style={{ color: 'green' }}>
                    <strong>Veritabanına kaydedildi</strong>
                  </p>
                )}
              </Card>
            )}
          </TabPane>
          
          <TabPane tab="Toplu Scraping" key="batch">
            <Form
              layout="vertical"
              onFinish={handleBatchScrape}
              initialValues={{
                options: {
                  useJs: true,
                  extractText: true,
                  extractLinks: true
                },
                category: 'general',
                processContent: true,
                saveToDb: true
              }}
            >
              <Form.Item name="urls" label="URL Listesi" rules={[{ required: true }]}>
                <TextArea 
                  rows={10} 
                  placeholder="Her satırda bir URL olacak şekilde URL'leri girin&#10;https://example.com&#10;https://example.org"
                />
              </Form.Item>
              
              <Form.Item name="category" label="Kategori">
                <Select>
                  <Option value="general">Genel</Option>
                  <Option value="legal">Yasal Mevzuat</Option>
                  <Option value="technical">Teknik Dokümantasyon</Option>
                  <Option value="news">Haberler ve Makaleler</Option>
                </Select>
              </Form.Item>
              
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="processContent" label="İçerik İşleme" valuePropName="checked">
                    <Switch checkedChildren="İşle" unCheckedChildren="İşleme" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="saveToDb" label="Veritabanı" valuePropName="checked">
                    <Switch checkedChildren="Kaydet" unCheckedChildren="Kaydetme" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="generateEmbeddings" label="Embeddings" valuePropName="checked">
                    <Switch checkedChildren="Oluştur" unCheckedChildren="Oluşturma" />
                  </Form.Item>
                </Col>
              </Row>
              
              <Form.Item>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={batchLoading} 
                  icon={<UploadOutlined />}
                  disabled={!crawl4aiStatus?.available}
                >
                  Toplu Scrape Başlat
                </Button>
              </Form.Item>
            </Form>
            
            {batchProgress && (
              <Card title="İşlem İlerlemi" style={{ marginTop: 16 }}>
                <Progress 
                  percent={batchProgress.progress} 
                  status={batchProgress.status === 'failed' ? 'exception' : 'active'}
                />
                <p>İşlenen: {batchProgress.processed} / {batchProgress.total}</p>
                
                {batchProgress.lastProcessedUrl && (
                  <p>
                    <strong>Son İşlenen URL:</strong>
                    <div style={{ wordBreak: 'break-all' }}>
                      {batchProgress.lastProcessedUrl}
                    </div>
                  </p>
                )}
                
                {batchProgress.status === 'completed' && (
                  <Alert
                    message="İşlem tamamlandı!"
                    type="success"
                    showIcon
                  />
                )}
                
                {batchProgress.status === 'failed' && (
                  <Alert
                    message={`İşlem başarısız: ${batchProgress.error}`}
                    type="error"
                    showIcon
                  />
                )}
              </Card>
            )}
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default Crawl4AIScraper;