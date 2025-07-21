import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Navigation from "@/components/navigation";

export default function Bylaws() {
  const bylawSections = [
    {
      chapter: "제1장",
      title: "총칙",
      articles: [
        {
          article: "제1조",
          title: "명칭",
          content: "본 회는 '동국대학교 한의과대학 동문회'라 한다."
        },
        {
          article: "제2조",
          title: "목적",
          content: "본 회는 동국대학교 한의과대학을 졸업한 동문 간의 친목을 도모하고 모교의 발전과 한의학의 발전에 기여함을 목적으로 한다."
        },
        {
          article: "제3조",
          title: "소재지",
          content: "본 회의 사무소는 서울특별시 중구 필동로1길 30 동국대학교 한의과대학 내에 둔다."
        }
      ]
    },
    {
      chapter: "제2장",
      title: "회원",
      articles: [
        {
          article: "제4조",
          title: "회원의 자격",
          content: "본 회의 회원은 동국대학교 한의과대학을 졸업한 자로 한다."
        },
        {
          article: "제5조",
          title: "회원의 권리",
          content: "회원은 다음의 권리를 갖는다.\n1. 총회 참석 및 의결권\n2. 임원 피선거권\n3. 회의 운영에 관한 발언권\n4. 동문회 사업 참여권"
        },
        {
          article: "제6조",
          title: "회원의 의무",
          content: "회원은 다음의 의무를 진다.\n1. 본 회 회칙 준수\n2. 총회 및 이사회 결의사항 준수\n3. 회비 납부\n4. 본 회의 명예 유지"
        }
      ]
    },
    {
      chapter: "제3장",
      title: "임원",
      articles: [
        {
          article: "제7조",
          title: "임원의 구성",
          content: "본 회의 임원은 다음과 같다.\n1. 회장 1명\n2. 부회장 2명\n3. 총무 1명\n4. 재무 1명\n5. 감사 2명\n6. 이사 약간명"
        },
        {
          article: "제8조",
          title: "임원의 임기",
          content: "임원의 임기는 2년으로 하며 연임할 수 있다."
        },
        {
          article: "제9조",
          title: "회장의 직무",
          content: "회장은 본 회를 대표하고 회무를 총괄하며 총회 및 이사회를 소집하고 그 의장이 된다."
        }
      ]
    },
    {
      chapter: "제4장",
      title: "회의",
      articles: [
        {
          article: "제10조",
          title: "총회",
          content: "총회는 본 회의 최고 의결기관으로서 정기총회와 임시총회로 구분한다."
        },
        {
          article: "제11조",
          title: "정기총회",
          content: "정기총회는 매년 1회 개최하며, 다음 사항을 의결한다.\n1. 전년도 사업실적 및 결산\n2. 당해연도 사업계획 및 예산\n3. 임원 선출\n4. 기타 중요사항"
        },
        {
          article: "제12조",
          title: "의결정족수",
          content: "총회의 의결은 재적회원 과반수의 출석과 출석회원 과반수의 찬성으로 한다."
        }
      ]
    },
    {
      chapter: "제5장",
      title: "재정",
      articles: [
        {
          article: "제13조",
          title: "재정",
          content: "본 회의 재정은 회비, 찬조금, 기타 수입으로 충당한다."
        },
        {
          article: "제14조",
          title: "회비",
          content: "회원은 총회에서 결정된 회비를 납부하여야 한다."
        },
        {
          article: "제15조",
          title: "회계연도",
          content: "본 회의 회계연도는 매년 1월 1일부터 12월 31일까지로 한다."
        }
      ]
    },
    {
      chapter: "제6장",
      title: "보칙",
      articles: [
        {
          article: "제16조",
          title: "회칙 개정",
          content: "본 회칙은 총회에서 재적회원 3분의 2 이상의 찬성으로 개정할 수 있다."
        },
        {
          article: "제17조",
          title: "시행일",
          content: "본 회칙은 2000년 3월 1일부터 시행한다."
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-kakao-gray p-4">
      <Navigation />
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-2 border-kakao-yellow">
          <CardHeader className="bg-kakao-yellow">
            <CardTitle className="text-2xl font-bold text-kakao-brown text-center">
              동국대학교 한의과대학 동문회 회칙
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-gray-600 text-center">
                본 회칙은 2000년 3월 1일 제정되어 2024년 현재까지 시행되고 있습니다.
              </p>
            </div>

            <div className="space-y-8">
              {bylawSections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="space-y-4">
                  <div className="bg-kakao-brown text-white p-3 rounded-lg">
                    <h2 className="text-xl font-bold text-center">
                      {section.chapter} {section.title}
                    </h2>
                  </div>
                  
                  <div className="space-y-4">
                    {section.articles.map((article, articleIndex) => (
                      <Card key={articleIndex} className="border border-gray-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg text-kakao-brown">
                            {article.article} ({article.title})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="text-gray-700 whitespace-pre-line leading-relaxed">
                            {article.content}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  {sectionIndex < bylawSections.length - 1 && (
                    <Separator className="my-6" />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 bg-blue-50 p-6 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-kakao-brown mb-3">부칙</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p>1. 본 회칙에 명시되지 않은 사항은 총회의 결의에 따른다.</p>
                <p>2. 본 회칙의 해석에 관하여 의견이 다를 때는 이사회의 결정에 따른다.</p>
                <p>3. 본 회칙은 동문회 홈페이지를 통해 공개하며, 회원은 언제든지 열람할 수 있다.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}