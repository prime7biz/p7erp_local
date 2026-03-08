import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const AIImageAnalysis = () => {
  const [activeImage, setActiveImage] = useState(0);
  
  // Sample image analysis data
  const analysisData = [
    {
      id: 1,
      title: "Quality Inspection: T-shirt collar defect",
      date: "Today, 10:23 AM",
      defectCount: 3,
      confidence: 98.7,
      tags: ["stitching", "collar", "severe"],
      imageUrl: "https://placehold.co/300x200/f97316/FFFFFF/png?text=Defect+Analysis+1",
      details: "AI vision system detected uneven stitching on collar attachment. Severity level: High"
    },
    {
      id: 2,
      title: "Quality Inspection: Fabric color variation",
      date: "Today, 9:45 AM",
      defectCount: 1,
      confidence: 92.5,
      tags: ["color", "fabric", "moderate"],
      imageUrl: "https://placehold.co/300x200/f97316/FFFFFF/png?text=Defect+Analysis+2",
      details: "AI vision system detected color variation in batch #A2345. Severity level: Medium"
    },
    {
      id: 3,
      title: "Quality Inspection: Button alignment",
      date: "Yesterday, 4:12 PM",
      defectCount: 2,
      confidence: 95.3,
      tags: ["button", "alignment", "minor"],
      imageUrl: "https://placehold.co/300x200/f97316/FFFFFF/png?text=Defect+Analysis+3",
      details: "AI vision system detected misaligned buttons on batch #B7890. Severity level: Low"
    }
  ];
  
  // Get badge color based on tag type
  const getTagColor = (tag: string) => {
    switch(tag) {
      case 'severe':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'moderate':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'minor':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'collar':
      case 'button':
      case 'alignment':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'color':
      case 'fabric':
      case 'stitching':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };
  
  const currentImage = analysisData[activeImage];
  
  return (
    <Card className="overflow-hidden border-primary/10 shadow-md bg-white/80 backdrop-blur-sm">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium flex items-center">
            <span className="material-icons mr-2 text-primary">image_search</span>
            AI Vision Quality Analysis
          </CardTitle>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
            Automated
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Image Preview */}
          <div className="flex flex-col">
            <div className="rounded-lg overflow-hidden border border-neutral-200 mb-2">
              <img 
                src={currentImage.imageUrl} 
                alt={currentImage.title}
                className="w-full h-48 object-cover"
              />
            </div>
            <div className="flex space-x-2 overflow-x-auto py-2">
              {analysisData.map((item, index) => (
                <button 
                  key={item.id}
                  onClick={() => setActiveImage(index)}
                  className={`h-16 w-16 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all ${
                    activeImage === index ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  <img 
                    src={item.imageUrl} 
                    alt={`Thumbnail ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
          
          {/* Analysis Details */}
          <div className="flex flex-col">
            <h3 className="font-medium text-lg mb-1">{currentImage.title}</h3>
            <p className="text-xs text-neutral-dark mb-3">{currentImage.date}</p>
            
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <span className="material-icons text-red-500 mr-1">error</span>
                <span className="text-sm">Defects detected: <strong>{currentImage.defectCount}</strong></span>
              </div>
              <div>
                <span className="text-sm font-medium">Confidence: <strong className="text-primary">{currentImage.confidence}%</strong></span>
              </div>
            </div>
            
            <div className="mb-4">
              <p className="text-sm">{currentImage.details}</p>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {currentImage.tags.map(tag => (
                <Badge key={tag} variant="outline" className={getTagColor(tag)}>
                  {tag}
                </Badge>
              ))}
            </div>
            
            <div className="mt-auto flex space-x-2">
              <button className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-dark font-medium px-4 py-2 rounded-md text-sm flex items-center justify-center">
                <span className="material-icons text-sm mr-1">history</span>
                View History
              </button>
              <button className="flex-1 bg-primary hover:bg-primary-dark text-white font-medium px-4 py-2 rounded-md text-sm flex items-center justify-center">
                <span className="material-icons text-sm mr-1">assignment_turned_in</span>
                Take Action
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};