/* global _ */
/* global Backbone */
/* version 1.0.0 */
//var BarcodeScanner = (function() {
var SERVER_URL = 'http://stock.vardion.com';
    function BarcodeScanner(callback) {
        this.buffer = [];
        this.delay = 51;
        this.timer = null;
        this.callback = callback;
        var _this = this;
        window.addEventListener('keypress',function(e){            
            if (e == null) {e = window.event;}            
            var charCode = typeof e.which === "number" ? e.which : e.keyCode;            
            if ((charCode === 13) && (_this.buffer.length)) {
                e.preventDefault();                                
                var code = _this.buffer.join(""); 
                _this.buffer = [];
                clearTimeout(_this.timer);
                return _this.callback.call(this,code);                
            } else {                
                if (!_this.buffer.length) {_this.timer = setTimeout((function() {return _this.buffer = [];}), _this.delay);}
                _this.buffer.push(String.fromCharCode(charCode));
            }            
            
        });
    }
//})();

var DB_ID = 'stock-scan_';
var qweb = new QWeb2.Engine();
qweb.preprocess_node = function(){
    //console.log(this.node.Type,this.node);
};

var context = { uid: 1, tz:'Asia/Jakarta',lang:'en_US'};
function login(db, login, password){
    var params = {};
        params.db = db;
        params.login = login;
        params.password = password;
        return rpc(SERVER_URL+'/web/session/authenticate', params);
                
}

function call(model,method,args){
    var params = {};
        params.model = model;
        params.method = method;
        params.args = args;
        params.kwargs = {context : context};
        return rpc(SERVER_URL+'/web/dataset/call_kw/' + model +'/' + method,params);    
}

//function write(model,id,data){
//    var params = {};                
//
//    params.model = model;
//    params.method = 'write';        
//    params.args = [id,data];
//    params.kwargs = {context : this.context};        
//    return call('/web/dataset/call_kw/' + model +'/write',params);
//},
function search_read(model,domain,fields){
    return rpc(SERVER_URL+'/web/dataset/search_read',
        { model  : model,
          domain : domain || [],
          fields : fields || [],
          limit  : 80,
          offset : 0,
          context: context,
        }
       )
}
function makeTemplate(name,tmpl){
    tmpl = tmpl  ? tmpl : $('#'+name).html()
    tmpl = '<templates><t t-name="'+name+'">' + tmpl + '</t></templates>';
    tmpl = tmpl.replace(/(<input.+?\/?>)/g,function(m){return m.replace(">","/>");} );       
    return tmpl;
}

var App =  Backbone.View.extend({
    el: $('body'),
    events: {
//			'*'                      : 'openOperations',
	    'click a#top_op'         : 'openOperations',
	    'click #operations .card': 'openListing',
        'click #pickings .card'  : 'openExecute',
        'click #download'        : 'download',
        'click #upload'          : 'upload',
	},
    initialize: function(){
        Backbone.View.prototype.initialize.apply(this,arguments);
        this.listing = new App.Listing();
        this.execute = new App.Execute();
        this.pickings = new App.PickingCollection();
        var tmpl = makeTemplate('operations');
        qweb.add_template(tmpl);            
        this.pickings.bind('ready',_.bind(this.render,this))        
        this.upload();       
    },
    hideAll:function(){
        $('section',this.el).hide();
        $('#download',this.el).hide();
        $('#upload',this.el).hide();
    },
    openOperations:function(ev){        
        this.hideAll();        
        this.pickings.load();        
        $('section#operations',this.el).show();
        $('#download',this.el).show();
        $('#upload',this.el).show();
                
    },
    openListing:function(ev){        
        this.hideAll();
        $('section#pickings',this.el).show();        
        var type = parseInt($(ev.currentTarget).data('type'));
        var pickings = this.pickings.filter(function(p){return p.get('picking_type_id')[0] == type;});        
        if (pickings.length < 1 ) return alert("You already done this pickings.\nPlease report to your manager if any correction");
        this.listing.start(pickings);
    },
    openExecute:function(ev){        
        this.hideAll();
        $('section#execute',this.el).show();        
        var picking_id = $(ev.currentTarget).data('id');                
        var picking = this.pickings.findWhere({id:picking_id});                
        if ( picking  < 1 ) return alert("You already done this pickings.\nPlease report to your manager if any correction");
        console.log(picking_id,picking);
        this.execute.start(picking);
    },
    upload:function(){        
        var self = this;
        var offline_fnct = _.bind(this.offline,this);
        var ret = this.pickings.push()
            .done(function(res){                
                self.download().fail(offline_fnct);                
            })
            .fail(offline_fnct);        
    },
    download:function(ev){
        var self = this;
        
        //if ($(ev.currentTarget).disable())
        return this.pickings.fetch().then(function(pickings){
            self.pickings = new App.PickingCollection(pickings);
            self.pickings.trigger('ready');
        }).fail(_.bind(this.offline,this));
    },    
    offline:function(){        
        $('h1.title',this.el).html("You're offline");        
        this.pickings.load();
    },
    render:function(){
        $('.wrapper .header h1.title').html();
        $('#operations').html( qweb.render('operations',{operations:this.pickings.populate()}) );
    },
    
});

App.Listing = Backbone.View.extend({
    el: $('.pickings.list'),    
    initialize:function(type,pickings){
       this.type = type;
       this.pickings = new App.PickingCollection(pickings);       
       qweb.add_template(makeTemplate('listing',this.$el.html()));       
    },
    start:function(pickings){        
        if (pickings) this.pickings = new App.PickingCollection(pickings);        
        this.render();        
    },
    render:function(){
        Backbone.View.prototype.render.apply(this,arguments);     
        this.$el.html( qweb.render('listing',{pickings:this.pickings.models}) );
        var picking = this.pickings.models[0];        
        var location = picking.get('picking_type_code') == 'incoming' ? picking.get('location_dest_id')[1] :picking.get('location_id')[1] ;                
        $('.wrapper .header h1.title').html(location);
    },
});

App.Execute = Backbone.View.extend({
    el: $('#execute .picking'),    
    events: {
        'click  .operation .decrease': 'decrease_qty',
        'click  .operation .increase': 'increase_qty',
        'change .operation input.qty_done': 'onchange_qty',
        'click  button.confirm': 'confirm',
        'click  .operation.serial': 'activate_serial'
    },
    initialize:function(picking){                     
       this.picking = picking;
       var tmpl = makeTemplate('picking',this.$el.html());       
       qweb.add_template(tmpl);
       new BarcodeScanner(_.bind(this.on_scan,this));
    },
    start:function(picking){        
        if (picking) this.picking = picking;
        console.log(picking);
        this.render();
    },
    render:function(){
        Backbone.View.prototype.render.apply(this,arguments); 
        $('.wrapper .header .row h1').html(this.picking.get_name());
        this.$el.html( qweb.render('picking',{picking:this.picking} ) );
    },
    activate_serial:function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        $('.operation.serial').removeClass('active');
        $(ev.currentTarget).addClass('active');
    },
    decrease_qty:function(ev){        
        ev.preventDefault();
        ev.stopPropagation();
        var input =$(ev.currentTarget).siblings('input.qty_done');
        input.val(parseFloat(input.val()) - 1 ).trigger('change');
    },
    increase_qty:function(ev){        
        ev.preventDefault();
        ev.stopPropagation();        
        var input =$(ev.currentTarget).siblings('input.qty_done');
        input.val( parseFloat(input.val()) + 1 ).trigger('change');
    },
    onchange_qty:function(ev){                
        var ops  =$(ev.currentTarget).closest('.operation');                        
        var ordered_qty = ops.data('ordered_qty')
        var done_qty = parseFloat(ev.currentTarget.value);                
        ops.removeClass('complete');
        if ( done_qty == ordered_qty ) ops.addClass('complete');
        if ( done_qty > ordered_qty ) alert("Working quantity already exceed to do quantity.\nPlease check your demand and fulfilment");
        if ( done_qty < 0 ) alert("You cannot do negative operation.\nPlease consult to your manager");
    },
    on_scan:function(code){        
        var card =  $('.operation[data-product_barcode='+code+'],.operation[data-product_sku='+code+'] ',this.el);        
        if (card.length){
            $('span.increase',card).click();
        }else{
            card = $('.operation.active.serial');
            if (card.length){// serial number;
                $('.desc',card).append($('span').html(code));
                $('.btn.increase',card).click();
            }else{ // package scan   
                
            }
            
            
        }        
    },
    confirm:function(ev){
        var self = this;        
        _(this.picking.get('pack_operation_ids')).each(function(op){
            var card = $('.operations[data-id='+ op.id +']',this.el);            
            op.qty_done =  parseFloat($('input.qty_done').val());
            
            var pack = card.closest('.pack').data();
            if (!_.isEmpty(pack)){
                op.result_package_id = pack;
            }
        });
        console.log(this.picking.get('pack_operation_ids'));
        
        $('#pickingModal').on('show.bs.modal',function(ev){             
          $('.modal-title',this).html(self.picking.get_name())  ;
          $('textarea',this).val(self.picking.get('note') || '' );          
          $('button.transfer',this).click(function(){               
            var note = $('textarea.note').val().trim();
            self.picking.set('note',note);
            self.picking.constructor.push(self.picking.toJSON())
                .done(function(){delete self.picking.id; self.picking.destroy();});
            self.back_to_listing();
          });            
        }).modal('show');
    },    
    back_to_listing:function(){
        console.log(this);
        $('section').hide();
        $('section#operations').show();        
    }
});

App.Picking = Backbone.Model.extend({
    initialize:function(json){
        Backbone.Model.prototype.initialize.apply(this,arguments);        
        this.parse(json);
    },
    parse:function(json){
        Backbone.Model.prototype.parse.apply(this,arguments);        
//        this.operations.models = _.reduce(json.pack_operation_ids,function(op){return new App.Operation(op)},[]);        
        _.map(json.pack_operation_ids,function(op){
            op.product = App.Picking.get_product(op.product_id[0]);
        });
//        console.log(this);
    },
    toJSON:function(json){        
        var ret = {'note':this.get('note') ,'picking_type_id' : this.get('picking_type_id')[0],id:this.id};
        ret['pack_operation_ids'] =  _.map(this.get('pack_operation_ids'),function(op){
            var vals = {'qty_done':op['qty_done'] ,
                        //linked_move_operation_ids:op.linked_move_operation_ids,
                        'product_id':op.product_id[0] };
            if (op.result_package_id){
                vals['result_package_id'] = [0,0,op.result_package_id];
                if (op.result_package_id.id) {
                    vals['result_package_id'] = [1,op.result_package_id.id,op.result_package_id];
                }
            } 
            var packop = [ 1,op.id,vals];
            if (op.product_qty < 0) {
                packop = [2,op.id, false];
            }            
            return packop;
        });
        
        return ret;
    },    
    get_name:function(){
        return this.get('display_name');
    },
    get_source:function(){
        return this.get('location_id')[1];
    },
    get_destination:function(){
        return this.get('location_dest_id')[1];
    },
    get_date:function(){
        return this.get('max_date');
    },
    get_customer:function(){
        return this.get('partner_id')[1];
    },
    get_owner:function(){
        return this.get('owner_id')[1];
    },
    get_code:function(){
        return this.get('picking_type_code');
    },    
    is_done:function(){
        return  _(this.get('pack_operation_ids')).all(function(op){return op.ordered_qty == op.done_qty;});
    },
    get_state_class:function(){
        return this.is_done() ? 'complete' : '';
    },
},{ 
    products: JSON.parse(localStorage[DB_ID + 'products'] || '[]'),
    packages: JSON.parse(localStorage[DB_ID + 'packages'] || '[]'),
    get_product:function(product_id){        
        return _(App.Picking.products).where({'id':product_id})[0];
    },
    get_package:function(package_id){
        if (isNaN(package_id)) return  _(App.Picking.packages).where({'name':package_id})[0];
        return _(App.Picking.packages).where({'id':package_id})[0];
    },
    push:function(picking){
        var ret = call('stock.picking','write',[picking.id,picking])
        .then(function(){
            call('stock.picking','do_transfer',[[picking.id]])
            .then(function(){   
                App.Picking.localize(picking.id);
            });
            
        })
        .fail(function(err){
            console.log(this,err);            
            App.Picking.localize(picking.id,picking);            
//            if (err == 'server') return window.location = SERVER_URL+'/web/login';
        }); 
        console.log(ret);
        return ret;
       
    },                                                                                                                                  
    localize:function(id,data){
        console.log(this,data);
        var workeds = JSON.parse(localStorage[DB_ID + 'workeds'] || '[]');
        var pos = workeds.findIndex(function(w){return w.id == id;});       
        console.log(workeds,pos);
        if (pos > -1) {workeds.splice(pos,1);}
        if (data){ workeds.push(data);}
        localStorage[DB_ID + 'workeds'] = JSON.stringify(workeds);  
        var pickings = JSON.parse(localStorage[DB_ID + 'backlogs']|| '[]');        
        pickings = _.reject(pickings,function(p){ return p.id == id;});        
        localStorage[DB_ID + 'backlogs'] = JSON.stringify(pickings);  
    }
    
});
App.PickingCollection = Backbone.Collection.extend({
    model : App.Picking,
    events: {
        'remove': 'populate'
    },
    fetch:   function(type){        
        var self = this;
        var def = $.Deferred();
        var domain = [["state", "in", ["assigned", "partially_available"]]];
        if (type) {domain.push(['picking_type_id','=',parseInt(type)]);}
        search_read('stock.picking',domain,['name','display_name','picking_type_code','picking_type_id','location_id','location_dest_id','date_done','min_date','max_date','state','note','origin','partner_id','owner_id','pack_operation_ids']).then(function(pickings){
//            if (! 'length' in pickings ) return window.location = SERVER_URL+'/web/login';
            if (!pickings.length ) return def.reject([]);
            pickings = pickings.records;
            var op_ids   =_.reduce(pickings,function(col,p){ return col.concat(p.pack_operation_ids); },[]);            
            search_read('stock.pack.operation',[['id','in',op_ids]]).then(function(ops){                                      
                var prod_ids =_.reduce(ops.records,function(col,p){ return col.concat(p.product_id[0]); },[]);
                search_read('product.product',[['id','in',prod_ids]],['name','display_name','barcode','default_code','storage_loc','tracking']).then(function(products){                       
                    self.save_to_db('products',products.records);
                });                   
                pickings = _.map(pickings,function(p){
                    var pops = _.filter(ops.records,function(op){return op.picking_id[0] == p.id; })
                    p['pack_operation_ids'] = pops;                    
                    return p;
                });
                def.resolve(pickings);         
                //self.parse(pickings);
                self.save_to_db('backlogs',pickings);
                self.load();                
            }); 
           }).fail(function(err) {
               console.log(err);
//               if (err === 'server') return window.location = SERVER_URL+'/web/login';
               return def.reject([]);
           });
        return def.promise();
    },
    push:function(){
        var workeds = JSON.parse(localStorage[DB_ID + 'workeds'] || '[]');        
        if (workeds.length){            
            var defs = workeds.map(this.model.push,[]);
            console.log(defs);
            return $.when.apply($,defs);
        }else {
            return $.Deferred().resolve(0);
        }
        
    },
    load:function(){
        var pickings = JSON.parse(localStorage[DB_ID + 'backlogs']|| '[]');
        this.parse(pickings);
        this.trigger('ready');
    },
    parse:function(result){        
        this.models = _.map(result,function(p){return new App.Picking(p);});        
        return this.models;        
    },
    save_to_db:function(name,data){
        localStorage[DB_ID + name] =  JSON.stringify(data);
    },
    populate:function(){        
        //var workeds = JSON.parse(localStorage[DB_ID + 'workeds'] || '[]');                
        var backlogs = this.reduce(function(types,p){            
            var type = p.get('picking_type_id');
            type = {id:type[0],name:type[1],'late':0,'ready':0,'todo':0,'code':'incoming'};            
            var typeIdx = _.findIndex(types,function(t){return t.id == type.id;});
            if (typeIdx >=0){type = types.splice(typeIdx,1)[0];}                        
            if (new Date(p.get('min_date')) < (new Date()).setHours(0,0,0,0)  ){type['late'] += 1;}
            if (p.get('state') == 'assigned'){type['ready'] += 1;}            
            type['todo'] += 1;            
            type['code'] = p.get('picking_type_code');            
            types.push(type);
            return types;
        },[]);        
        return backlogs;
    },    
});
