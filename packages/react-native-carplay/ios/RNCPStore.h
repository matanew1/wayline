#import <Foundation/Foundation.h>
#import <CarPlay/CarPlay.h>

@interface RNCPStore : NSObject {
}

@property (nonatomic, strong) NSString *rootTemplateId;
@property (nonatomic, strong) id dashboard;
@property (nonatomic, strong) id app;
@property (nonatomic, strong) NSMutableDictionary<NSString*, id> *cluster;

+ (instancetype)sharedManager;
- (CPTemplate*) findTemplateById: (NSString*)templateId;
- (NSString*) setTemplate:(NSString*)templateId template:(CPTemplate*)carPlayTemplate;
- (CPTrip*) findTripById: (NSString*)tripId;
- (NSString*) setTrip:(NSString*)tripId trip:(CPTrip*)trip;
- (CPNavigationSession*) getNavigationSession;
- (void) setNavigationSession:(CPNavigationSession*)navigationSession;
- (NSArray*) getTemplateIds;
- (BOOL) getVisibility:(NSString*) sceneId;
- (void) setVisibility:(BOOL)isVisible forScene:(NSString *)sceneId;

@end
