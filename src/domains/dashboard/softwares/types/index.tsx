export type {
    IsoftwareCategory,
    ISoftwareCategoryListResponse,
    ICategoryProductRequestPayload,
} from './category';

export type {
    IProduct,
    ICategoryProductsResponse,
    ISearchProductRequestPayload,
    ISearchProductResponse,
    IProductDetailsRequestPayload,
    IProductDetailsResponse,
    FiltersType,
    IProductCard,
    IGetAssistanceRequestPayload,
    IGetAssistanceResponse,
    IFetchOrderDetailsPayload,
    IFetchOrderDetailsResponse,
    ICancelPlanPayload,
    IPricingPlan,
    IPurchaseOption,
    IPricingOption,
} from './product';

export type {
    IFindQuestionsRequestPayload,
    IFindGeneralQuestionsResponse,
    IFindCategoryQuestionsResponse,
    IQuestion,
    IGeneralQuestions,
    IQuestionOption,
    AnswerType,
    AnswerValue,
    AnswerEntry,
    AnswerMap,
    FinalPayload,
    ISubmitAnswersRequestPayload,
    ISubmitAnswersResponse,
    IGetRecommandationRequestPayload,
    IGetRecommandationResponse,
    FinalPayloadQuestion,
} from './rfp';

export type Answers = Record<string, string | number>;
