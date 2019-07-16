var mongojs = require('mongojs');

var logger = require('./../logConfig/logConfig');

var syncController = {};

const CreateNewEntityAndReturnCreated = function (entityDateMark,entity, entityCollection, next) {
    entity.LastUpdated = new Date();


    //console.log('CreateNewEntityAndReturnCreated...');

    entity.IsActive = entity.IsActive||true;
    entity.IsDeleted = entity.IsDeleted || false;

    entityCollection.save(entity, null, function (error, createdEntity) {
        //console.log('CreateNewEntityAndReturnCreated...');
        //console.log(createdEntity);
        next(createdEntity);
    });
};

const GetExistingEntity = function (entityCollection, entityId, next) {
    entityCollection.findOne({ Id: entityId }, function (error, foundEntity) {
        next(foundEntity);
    });
};

const GetExistingEntitiesCount = function (entityCollection, entityId, next) {
    entityCollection.count({ Id: entityId }, function (err, existingEntities) {
        next(existingEntities);
    });
};

const GetAllCollectionNames = function (tenantStore, next) {
    tenantStore.getCollectionNames(function (err, collectionNames) {
        next(collectionNames);
    });
};

//TODO: Find out why the db connection crashes when I use this method 
//           ..but doesn't crash when I include this method's logic in the caller method.
// const FindNeighborForEntity = function (entityCollection, NewEntityDateMark, localIds, next) {

//     entityCollection.find({ $and: [{ _id: { $nin: localIds } }, { LastUpdated: { $gt: NewEntityDateMark } }] },
//         function (err, newNeighbours) {
//             next(newNeighbours);
//         });
// };

const GetNewAliens = function (localEntities, tenantStore, NewEntityDateMark,IsSetUpCall, next) {

    var localIds = localEntities.map(function (payLoadEntry) { return mongojs.ObjectId(payLoadEntry._id); });
    //logger.debug("Local Ids :" + localIds);

    //Go through all the collections.
    
    //console.log('entity date mark from the client '+NewEntityDateMark);
    GetAllCollectionNames(tenantStore, function (collectionNames) {
        var allNeighbours = [];
        var doneCount = 0;
		
		var index = collectionNames.indexOf('Patient');
		
		logger.debug('before splicing...'+collectionNames.length);
		
		collectionNames.splice(index,1);
		logger.debug('after splicing...'+collectionNames.length);
		
        collectionNames.forEach(function (collectionName) {

            //If there's any entity that is not already a part of the reply payload, and whose last update mark is after our marker, 
            //then add them to the reply payload. 
            //TODO: Take care of the edge case where multiple clients submit updates at EXACTLY the same time.//
            //  Hmmmmmm......... *Head scratching*

            
			
            var entityCollection = tenantStore.collection(collectionName);
            
            NewEntityDateMark = new Date(NewEntityDateMark);

            var minutes=NewEntityDateMark.getMinutes();
            var seconds=NewEntityDateMark.getSeconds();
            var milliseconds=NewEntityDateMark.getMilliseconds();
            var hrs = NewEntityDateMark.getHours();

            var dateMarkOffset = new Date(NewEntityDateMark.getFullYear(), NewEntityDateMark.getMonth(), NewEntityDateMark.getDate(), hrs, minutes, seconds, milliseconds);
            
            entityCollection.find(
                { 
                    $and: [
                        { _id: { $nin: localIds } }, 
                        { LastUpdated: { $gte: NewEntityDateMark } }
                    ] 
                },
                function (err, entities) {
                    doneCount++;
                    //console.log(entities.length);

                    //if(collectionName!='Patient'){
                        entities.map(function (entity) {
                            //This local Id has nothing to do with the Local Id above: 
                            ///TODO: Get a better name for the one above.
                            //entity.LastSynchTime =  NewEntityDateMark;
    
                            entity.LocalId = undefined;
                        //console.log('found update entity is ');
                        //console.log(entity);
                            return entity;
                        });

                        if(IsSetUpCall){
                            allNeighbours.push({tableName:collectionName,Entities: entities});
                        }
                        else{
                            //console.log(entities.length);
                            // allNeighbours.push(entities);
                            // console.log(allNeighbours.length);
                            //console.log(entities);
                            Array.prototype.push.apply(allNeighbours, entities);
                        }
                    //}

                    if (doneCount == collectionNames.length) {
                        next(allNeighbours);
                    }
                });
        });
    });
};

syncController.GetNextClientSequenceValue = function (estate,tenantId, next) {

    //var estate = GetStoreConnection('EstateStore');

    var sequenceDocument = estate.Tenants.findAndModify({
        query: { _id: mongojs.ObjectId(tenantId) },
        update: { $inc: { SequenceValue: 1 } },
        new: true
    }, function (error, sequenceDocument, lastErrorObject) {

	logger.debug(error);
    next(sequenceDocument.SequenceValue);
    });
};

syncController.SyncEntities = function (requestPayLoad,tenantStore,reply){
    var replyBody = {};
    var replyPayLoad = [];
    var doneCount = 0;
    replyBody.NewEntityDateMark = new Date();

    var GetForeignEntitiesAndReply = function () {
         //Possible source of grief from cyclic entity update.
        //Get all the existing ids from the client.
        GetNewAliens(replyPayLoad, tenantStore, requestPayLoad.NewEntityDateMark,requestPayLoad.IsSetUpCall,
            function (newNeighbours) {
                Array.prototype.push.apply(replyPayLoad, newNeighbours);
                replyBody.payload = replyPayLoad;
                reply(replyBody);
            });
    };

        //This is a new terminal: 
        ///TODO: Batch the reply payload?
        if (requestPayLoad.Entities.length == 0) {
            GetForeignEntitiesAndReply();
        }

        requestPayLoad.Entities.forEach(function (entity) {
            var entityCollection = tenantStore.collection(entity.ObjectName);

            GetExistingEntitiesCount(entityCollection, entity.Id,
                function (existingEntitiesCount) {
                    //Is there a matching entity with the same ID?
                    if (existingEntitiesCount > 0 && existingEntitiesCount!==null) {
                        
                              
                        GetExistingEntity(entityCollection, entity.Id,
                            function (foundEntity) {
                                //is the existing entity a later version than the incoming entity?
				                //cons.debug("The last updated from sent entity is: "+ entity.LastUpdated);
                                
                           
                                if (foundEntity && foundEntity.LastUpdated > entity.LastUpdated) {
                                    //Update incoming entity and notify reply-bound payload.
                                    foundEntity.LastSynchTime = replyBody.NewEntityDateMark;
                                    //foundEntity.LocalId = undefined;
                                    replyPayLoad.push(foundEntity);
                                } else 
									if(foundEntity) {
                                    //UPDATE EXISTING ENTITY AND NOTIFY REPLY PAY LOAD
                                    //      Possible, race-condition prone case 
                                    //          where the client didn't get the memo that the server _id 
                                    //          has been set.
                                    entity._id = foundEntity._id;
                                    entityCollection.LastSynchTime = new Date();
                                    entity.LastUpdated = new Date();
                                    
                                    entityCollection.save(entity);
                                    //Update and notify payload                                    
                                    //notify the reply payload? 
                                    //      Ah well, the client has to know the new update date.
                                    replyPayLoad.push(entity);
                                }
                                doneCount++; //We are sure that this part of the iteration is done here.
                                if (doneCount == requestPayLoad.Entities.length) {
                                    GetForeignEntitiesAndReply();
                                }
                            });
                    } else {
                        //It doesn't exist. Create a new one and notify the reply payload.
                        CreateNewEntityAndReturnCreated(requestPayLoad.NewEntityDateMark,entity, entityCollection,
                            function (createdEntity) {
                                
                                replyPayLoad.push(createdEntity);

                                doneCount++; //We are sure that this part of the iteration is done here.
                                
                                if (doneCount == requestPayLoad.Entities.length) {
                                    GetForeignEntitiesAndReply();
                                }
                            });
                    }
                });
        });
};

syncController.UploadDefaultData = function (requestPayLoad,tenantStore,reply){
	var count = 0;
	requestPayLoad.forEach(function (entity) {
		var entityCollection = tenantStore.collection(entity.ObjectName);
		entity.Entities = JSON.parse(JSON.stringify(entity.Entities),JSON.dateParser);
		entityCollection.insert(entity.Entities);
		count++;
	});
	if(count==requestPayLoad.length){
		reply();
	}
};


module.exports = syncController;