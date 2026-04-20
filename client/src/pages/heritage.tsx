import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Info, UserCheck, History, FileText, Award, Image as ImageIcon
} from "lucide-react";

import { HistorySection } from "@/components/heritage/history-section";
import { OrganizationSection } from "@/components/heritage/organization-section";
import { BylawsSection } from "@/components/heritage/bylaws-section";
import { PresidentsSection } from "@/components/heritage/presidents-section";
import { GallerySection } from "@/components/heritage/gallery-section";

export default function HeritagePage() {
    const [activeSection, setActiveSection] = useState("history");

    // 페이지 로드 시 최상단으로 스크롤
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const sections = [
        { id: "history", label: "연혁", icon: <History size={20} /> },
        { id: "organization", label: "조직도/임원", icon: <UserCheck size={20} /> },
        { id: "presidents", label: "역대회장", icon: <Award size={20} /> },
        { id: "bylaws", label: "회칙", icon: <FileText size={20} /> },
        { id: "gallery", label: "역사관", icon: <ImageIcon size={20} /> }
    ];

    const renderContent = () => {
        switch (activeSection) {
            case "history":
                return <HistorySection />;
            case "organization":
                return <OrganizationSection />;
            case "presidents":
                return <PresidentsSection />;
            case "bylaws":
                return <BylawsSection />;
            case "gallery":
                return <GallerySection />;
            default:
                return <HistorySection />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <div className="bg-kakao-brown text-white py-8 px-4 mb-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-3xl font-bold mb-2">동문회 헤리티지</h1>
                    <p className="text-white/80">동국대학교한의과대학동문회의 역사와 전통을 소개합니다.</p>
                </div>
            </div>

            <div className="px-4">
                {/* 섹션 네비게이션 */}
                <div className="max-w-4xl mx-auto mb-6">
                    <Card className="border border-gray-200 shadow-sm">
                        <CardContent className="p-2">
                            <div className="flex overflow-x-auto pb-2 md:pb-0 gap-2 md:grid md:grid-cols-5 no-scrollbar">
                                {sections.map((section) => (
                                    <Button
                                        key={section.id}
                                        variant={activeSection === section.id ? "default" : "ghost"}
                                        className={`flex-shrink-0 flex items-center justify-center space-x-2 p-3 h-auto ${activeSection === section.id
                                            ? "bg-kakao-yellow text-kakao-brown hover:bg-kakao-yellow/90"
                                            : "hover:bg-gray-100 text-gray-600"
                                            }`}
                                        onClick={() => setActiveSection(section.id)}
                                    >
                                        {section.icon}
                                        <span className="text-sm font-medium whitespace-nowrap">{section.label}</span>
                                    </Button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* 컨텐츠 영역 */}
                <div className="max-w-4xl mx-auto">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
