#import "RNCPStore.h"

@implementation RNCPStore {
    NSMutableDictionary* _templatesStore;
    CPNavigationSession* _navigationSession;
    NSMutableDictionary* _tripsStore;
    NSMutableDictionary<NSString*, NSNumber*>* _sceneVisibility;
}

-(instancetype)init {
    if (self = [super init]) {
        _templatesStore = [[NSMutableDictionary alloc] init];
        _tripsStore = [[NSMutableDictionary alloc] init];
        _sceneVisibility = [[NSMutableDictionary alloc] init];
        self.cluster = [[NSMutableDictionary alloc] init];
    }

    return self;
}

+ (RNCPStore*) sharedManager {
    static RNCPStore *shared = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        shared = [[self alloc] init];
    });
    return shared;
}

- (CPTemplate*) findTemplateById:(NSString*)templateId {
    return [_templatesStore objectForKey:templateId];
}

- (NSString*) setTemplate:(NSString*)templateId template:(CPTemplate*)carPlayTemplate {
    [_templatesStore setObject:carPlayTemplate forKey:templateId];
    return templateId;
}

- (CPTrip*) findTripById:(NSString*)tripId {
    return [_tripsStore objectForKey:tripId];
}

- (NSString*) setTrip:(NSString*)tripId trip:(CPTrip*)trip {
    [_tripsStore setObject:trip forKey:tripId];
    return tripId;
}

- (CPNavigationSession*) getNavigationSession {
    return _navigationSession;
}

- (void) setNavigationSession:(CPNavigationSession*)navigationSession {
    _navigationSession = navigationSession;
}

- (NSArray*) getTemplateIds {
    return [_templatesStore allKeys];
}

- (void) setVisibility:(BOOL)isVisible forScene:(NSString*)sceneId {
    [_sceneVisibility setObject:@(isVisible) forKey:sceneId];
}

- (BOOL) getVisibility:(NSString *)sceneId {
    return [_sceneVisibility objectForKey:sceneId].boolValue;
}

@end
