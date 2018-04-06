/* global _ */
/* global Backbone */
/* version 1.0.0 */
var SERVER_URL = 'http://stock.vardion.com';
var DB_ID = 'stock-scan@';
var context = {};

var qweb = new QWeb2.Engine();
qweb.preprocess_node = function(){
    //console.log(this.node.Type,this.node);
};
var ENTER_KEY =  13;
function BarcodeScanner(callback) {
    this.buffer = [];
    this.delay = 201;
    this.timer = null;
    this.callback = callback;
    var _this = this;
    window.addEventListener('keypress',function(e){            
        if (e == null) {e = window.event;}            
        var charCode = typeof e.which === "number" ? e.which : e.keyCode;            
        if ((charCode === ENTER_KEY) && (_this.buffer.length)) {
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

function prompt(title,desc){
    var def = $.Deferred();
    $('#modal-prompt').off('show.bs.modal').on('show.bs.modal',function(ev){             
        $('.modal-title',this).html(title)  ;
        $('.note',this).attr('placeholder',desc);
        $('button#ok',this).off('click').on('click',function(){               
          var note = $('.note').val().trim();
          def.resolve(note);            
        });            
        $('button.cancel',this).off('click').on('click',function(){               
          var note = $('.note').val().trim();
          def.reject(note);            
        });            
        
      }).modal('show');    
    return def.promise();
}

function login(db, login, password){
    var params = {};
        params.db = db;
        params.login = login;
        params.password = password;
//        params.args = [db,login,password];
//        params.method = 'authenticate';
//        params.kwars = {};
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

function search_read(model,domain,fields){
    return rpc(SERVER_URL+'/web/dataset/search_read',
        { model  : model,
          domain : domain || [],
          fields : fields || [],
          limit  : 80,
          offset : 0,
          context: context,
        }
       );
}
function makeTemplate(name,tmpl){
    tmpl = tmpl  ? tmpl : $('#'+name).html()
    tmpl = '<templates><t t-name="'+name+'">' + tmpl + '</t></templates>';
    tmpl = tmpl.replace(/(<input.+?\/?>)/g,function(m){return m.replace(">","/>");} );       
    return tmpl;
}

var DB = {    
    get_backlogs:function(){
        return this.load('backlogs');       
    },
    get_workeds:function(){
        return this.load('workeds');        
    },
    get_products:function(){
        return this.load('products');        
    },
    get_packages:function(){
        return this.load('packages');
    },
    get_product:function(product_id){
        return _(this.get_products()).find({'id':product_id});
    },
    get_package:function(package_id){        
        return _(this.get_packages()).find({'id':package_id}) || _(this.get_packages()).find({'name':package_id});
    },
    load:function(name,def){
        if (!def) {def = '[]';}
        return JSON.parse(localStorage[DB_ID + name] || def);
    },
    save:function(name,data){
        localStorage[DB_ID + name] = JSON.stringify(data);        
    }
};

var App =  Backbone.View.extend({
    el: $('body'),
    events: {
		'*'                      : 'openOperations',
	    'click .navbar'          : 'openOperations',
	    'click #operations .card': 'openListing',
        'click #pickings   .card': 'openExecute',
        'click #sync'            : 'sync',
        'click #loginbutton'     : 'login',
	},
    initialize: function(dbname){
        Backbone.View.prototype.initialize.apply(this,arguments);
        if (!dbname) {dbname = (new URL(SERVER_URL)).host.split('.')[0];}
        this.dbname = dbname;
        DB_ID = DB_ID + dbname + '_';
        
        this.pickings = new App.PickingCollection();
        
        this.listing = new App.Listing();        
        this.execute = new App.Execute();        
        
        var tmpl = makeTemplate('operations');
        qweb.add_template(tmpl);            
        this.pickings.bind('ready',_.bind(this.render,this));
        this.execute.bind('done',_.bind(this.openOperations,this));
        this.listing.bind('back',_.bind(this.openOperations,this));
        this.ensure_db();
    },
    hideAll:function(){
        $('section',this.el).hide();        
        $('#sync',this.el).hide();
    },
    ensure_db:function(){        
        context      = DB.load('context','{}');
        var backlogs = DB.get_backlogs();
        if (!backlogs.length && _(context).isEmpty() ) {
            this.openLogin();
        }else{
            this.session = DB.load('session',"{'name':'Warehouse'}");
            this.sync();
        }
    },
    login:function(ev){
        var def =  $.Deferred();        
        var self = this;
        var username = $('input#username').val();
        var password = $('input#password').val();
        $('#splash').show();
        login(this.dbname,username,password).then(function(session){            
            if (session.server_version < 10.0) {
                var modal = $('#modal-dialog');
                modal.find('.modal-title').text('Not Compatible Server');
                modal.find('.modal-body').text('Only working for Odoo/Vardion version 10.0');
                $('#modal-dialog').modal();
                def.reject();
                return ;
            }
            self.sync();                        
            DB.save('context',session.user_context);
            DB.save('session',session);            
            self.session = session;
            $('main.login',this.el).hide();
            $('main.index-page',this.el).show();
            def.resolve(session);
        })
        .fail(function(err){            
            $('#splash').hide();
            if (err == 'server' ) {
                var modal = $('#modal-dialog');
                modal.find('.modal-title').text('Login Error');
                modal.find('.modal-body').text('Wrong Username / Password ');
                $('#modal-dialog').modal();
            }else{
                var modal = $('#modal-dialog');
                modal.find('.modal-title').text("You're offline");
                modal.find('.modal-body').text("Please check your connection.\n" + err);
                $('#modal-dialog').modal();
            }            
        });;        
        return def.promise();
    },
    openLogin:function(ev){
        $('main.login',this.el).show();
        $('main.index-page',this.el).hide();
    },    
    openOperations:function(ev){
        this.hideAll();        
        this.render();        
        $('section#operations',this.el).show();                
        $('#sync',this.el).show();                
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
        var pickings = DB.get_backlogs();
        var picking = _(pickings).find({'id':picking_id});        
        if ( picking.length  < 1 ) return alert("You already done this pickings.\nPlease report to your manager if any correction");        
        var pick = new App.Picking(picking);        
        this.execute.start(pick);
    },      
    sync:function(){
        var self = this;
        $('#splash').show();
        return this.pickings.fetch().then(function(pickings){
                var expected_ids = _(pickings).pluck('id');
                self.pickings.push(expected_ids);
            })
        .fail(_.bind(this.offline,this))
        ;
    },
    offline:function(err){  
        alert(err);
        $('#splash').hide();
        if (err === 'server'){
            this.openLogin();
        }else{
            $('.navbar-brand',this.el).html("You're offline");        
            this.pickings.load();
        }
    },
    render:function(){
        $('.wrapper .header h1.title').html();
        $('#splash').hide();
        $('.navbar-brand').html(this.session.name);
        var cnt = $('#worked-cnt').hide();
        var workeds = DB.get_workeds();
        if (workeds.length){
            cnt.html(workeds.length).show();
        }
        this.pickings.load();
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
        $('.navbar-brand').html(picking.get('picking_type_id')[1]);
    },
});

App.Execute = Backbone.View.extend({
    el: $('#execute'),    
    events: {
        'click  .operation .decrease'   : 'decrease_qty',
        'click  .operation .increase'   : 'increase_qty',
        'change .operation input.qty_done': 'onchange_qty',
        'click  button.confirm'         : 'confirm',
        'click  .operation.serial'      : 'activate_serial',
        'keypress .operation.serial input': 'add_serial'
    },
    initialize:function(picking){                            
       var tmpl = makeTemplate('picking',this.$el.html());       
       qweb.add_template(tmpl);
       new BarcodeScanner(_.bind(this.on_scan,this));       
       //if (picking) this.start(picking);
    },
    start:function(picking){        
        if (picking) this.picking = picking;        
        this.render();
        $('section').hide();
        $('#execute').show();
    },
    render:function(){
        Backbone.View.prototype.render.apply(this,arguments); 
        $('.navbar-brand').html(this.picking.get_name());        
        this.$el.html( qweb.render('picking',{picking:this.picking} )  );
    },
    activate_serial:function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        $('.operation.serial').removeClass('active');
        $(ev.currentTarget).addClass('active');
    },
    add_serial:function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        var charCode = typeof ev.which === "number" ? ev.which : ev.keyCode;
        if (charCode === ENTER_KEY) {
            this.on_scan(ev.currentTarget.value);
        }
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
        ops.removeClass('success');
        if ( done_qty == ordered_qty ) ops.addClass('success');
        if ( done_qty > ordered_qty ) alert("Working quantity already exceed to do quantity.\nPlease check your demand and fulfilment");
        if ( done_qty < 0 ) alert("You cannot do negative operation.\nPlease consult to your manager");
    },
    on_scan:function(code){        
        if ($(':input:focus,textarea:focus').length) return;
        var card =  $('.operation[data-product_barcode='+code+'],.operation[data-product_sku='+code+'] ',this.el);        
        if (card.length){
            $('button.increase',card).click();
        }else{
            var quants = DB.get_package(code);            
            if ( quants && quants.length ){                
                var ul  = this.add_package(quants[0].package_id);
                _(quants).each(function(q){
                    card =  $('.operation[data-product_id='+ q.product_id[0] +'],',this.el);
                    if (card){
                        var qty_done = $('input.qty_done',card);
                        qty_done.val( qty_done.val() + q.qty);
                    }
                    card.appendTo(ul);
                });
                return false;
            }
            card = $('.operation.active.serial');            
            if (card.length){// serial number;
                if ( ! $('span:contains('+code +')',card).length ) {
                    $('.desc',card).append($('<span/>').html(code));
                    return $('button.increase',card).click();
                }
                return false;
            }
            return alert("Barcode not associate with any product or package");
        }        
    },
    add_package:function(pack){
        $('.pack.active',this.el).removeClass('active');
        var name = (typeof pack == 'object') ? pack[1] : pack;
        var ul = $('ul.pack[data-name='+name+']',this.el);
        if (ul.length )return ul.addClass('active');        
        return $('<ul data-name='+name+'/>').appendTo($('.row',this.el).last()).addClass('pack active');
    },
    put_in_pack:function(ev){        
        if ( $('.operation.complete',this.el).length < 1) return alert("There no worked quantity to put in pack");        
        var self = this;
        prompt("Enter/Scan Package Code")
        .then(function(name){
            var packUL = self.add_package(name);
              $('.operation.complete',this.el).appendTo(packUL);
        });        
    },
    confirm:function(ev){
        var self = this;  
        if( $('.operation.card.success').length !== $('.operation.card').length ){
            return alert('Operation not complete, please check all quantity to meet requested');
        }
        
        _(this.picking.get('pack_operation_ids')).each(function(op){
            var card = $('.operations[data-id='+ op.id +']',this.el);            
            op.qty_done =  parseFloat($('input.qty_done').val());
            
            var pack = card.closest('.pack').data();
            if (!_.isEmpty(pack)){
                op.result_package_id = pack;
            }
            if (op.product.tracking === 'serial'){
                op.pack_lot_ids = [];
                var spans = $('.desc span',card.get(0)).toArray();                
                for (var sp in spans ) {                   
                    op.pack_lot_ids.push([0,0,{'lot_name': spans[sp].innerText ,'qty':1,'plus_visible':true}]); 
                }                
            }
            
            
        });
//        console.log("BEFORE CONFIRM :",this.picking.get('pack_operation_ids'));
        
        prompt(self.picking.get_name(),"Enter Note for Picking")
        .then(function(note){
            self.picking.set('note',note);
            self.picking.constructor.push(self.picking.toJSON())
                .done(function(){delete self.picking.id; self.picking.destroy();});
            self.trigger('done');
        });                
    },    

});

App.Picking = Backbone.Model.extend({
    initialize:function(json){
        Backbone.Model.prototype.initialize.apply(this,arguments);        
        this.parse(json);
    },
    parse:function(json){        
        var self = this;
        Backbone.Model.prototype.parse.apply(this,arguments);
        _.map(json.pack_operation_ids,function(op){
            op.product = DB.get_product(op.product_id[0] );
        });

    },
    toJSON:function(){        
        var ret = {'note':this.get('note') ,'picking_type_id' : this.get('picking_type_id')[0],id:this.id , name:this.get('name')};
        ret['pack_operation_ids'] =  _.map(this.get('pack_operation_ids'),function(op){
            var vals = {'qty_done'  : op['qty_done'] ,                        
                        'product_id': op.product_id[0],
                        };
            if (op.result_package_id){
                vals['result_package_id'] = op.result_package_id;
            } 
            
            if (op.product.tracking === 'serial'){
                vals['pack_lot_ids'] = op.pack_lot_ids;
            }
            
            var packop = [ 1,op.id,vals];
            if (op.product_qty < 0) {
                packop = [2,op.id, false];
            }            
            return packop;
        });
        console.log( "JSON" , ret['pack_operation_ids']);
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
        return  _(this.get('pack_operation_ids')).all(function(op){return op.ordered_qty === op.done_qty;});
    },
    get_state_class:function(){
        return this.is_done() ? 'complete' : '';
    },
    get_total_product:function(){
        return _(this.get('pack_operation_ids')).reduce(function(sum,op){return sum+ op.ordered_qty;},0);
    }
},{ 
    push:function(picking){                
        var packages = _(picking.pack_operation_ids).groupBy(function(op){return op[2]['result_package_id'];});
        var defs = [];
        picking.pack_operation_ids = [];
        for (var pack in packages){                        
            if (pack != 'undefined') {                                
                defs.push(
                    call('stock.quant.package','find_or_create',[pack ]).then(function(pack_id){                        
                        _(packages[pack]).each(function(op){ op[2].result_package_id = pack_id;});
                        picking.pack_operation_ids = picking.pack_operation_ids.concat(packages[pack]);                        
                    })
                );
            }else{
                picking.pack_operation_ids = picking.pack_operation_ids.concat(packages[pack]);
            }            
        }                
        return $.when.apply($, defs).done(function(){
            call('stock.picking','write',[picking.id,picking])
            .then(function(){
                call('stock.picking','do_transfer',[[picking.id]])
                .then(function(){App.Picking.localize(picking.id);})                            
                .fail(function(err){
                    if ( err=='server'){
                        alert('Order #' + picking.name + " failed to validate.\nUse Web Interface to resolve");
                        App.Picking.localize(picking.id);
                    }else {
                        App.Picking.localize(picking.id,picking);
                    }
                })
            })
            .fail(function(err){
                if ( err=='server'){
                    alert('Order #' + picking.name + " failed to validate.\nUse Web Interface to resolve");
                    App.Picking.localize(picking.id);
                }else {
                    App.Picking.localize(picking.id,picking);
                }
            }); 
        });       
    },                                                                                                                                  
    localize:function(id,data){        
        var workeds = DB.get_workeds();
        var pos = workeds.findIndex(function(w){return w.id == id;});               
        if (pos > -1) {workeds.splice(pos,1);}
        if (data){ workeds.push(data);}        
        DB.save('workeds',workeds);
        
        var pickings = DB.get_backlogs();
        pickings = _.reject(pickings,function(p){ return p.id == id;});        
        DB.save('backlogs',pickings)
        
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
        search_read('stock.picking',domain,['name','display_name','picking_type_code','picking_type_id','location_id','location_dest_id','date_done','min_date','max_date','state','note','origin','partner_id','owner_id','pack_operation_ids'])
        .then(function(pickings){
            if (!pickings.length ) return def.reject([]);
            pickings = pickings.records;
            var op_ids   =_.reduce(pickings,function(col,p){ return col.concat(p.pack_operation_ids); },[]);            
            search_read('stock.pack.operation',[['id','in',op_ids]]).then(function(ops){                                      
                var prod_ids =_.reduce(ops.records,function(col,p){ return col.concat(p.product_id[0]); },[]);
                var loc_ids  = _.reduce(ops.records,function(col,p){ return col.concat(p.location_id[0],p.location_dest_id[0] ) ; },[]);
                pickings = _.map(pickings,function(p){
                    var pops = _.filter(ops.records,function(op){return op.picking_id[0] == p.id; });
                    p['pack_operation_ids'] = pops;                    
                    return p;
                });
                search_read('product.product',[['id','in',prod_ids]],
                        ['name','display_name','barcode','default_code','storage_loc','tracking'])
                    .then(function(products){                       
                        DB.save('products',products.records);                        
                        self.trigger('ready');
                });                   
                search_read('stock.quant',[ ['package_id','!=',false],['location_id','in', loc_ids ]],
                        ['name','product_id','qty','product_uom_id','location_id','package_id'])
                    .then(function(packages){
                        DB.save('packages',packages.records);
                    });                   
                
                def.resolve(pickings);                
                DB.save('backlogs',pickings);                
            }); 
           }).fail(function(err) {               
               return def.reject(err);
           });
        return def.promise();
    },
    push:function(expecteds){
        var workeds = DB.get_workeds();
        var filtered = _(workeds).filter(function(w) {return expecteds.indexOf(w.id) >= 0; } );
        DB.save('workeds',filtered);
        workeds = DB.get_workeds();
        if (workeds.length){                  
            var defs = workeds.map(this.model.push,[]);
            return $.when.apply($,defs);
        }else {
            return $.Deferred().resolve(0);
        }
        
    },
    load:function(){        
        this.parse(DB.get_backlogs());        
    },
    parse:function(result){        
        this.models = _.map(result,function(p){return new App.Picking(p);});                
        return this.models;        
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
