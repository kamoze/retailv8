/*
* @Author: D.Jane
* @Email: jane.odoo.sp@gmail.com
*/
function pos_stock(instance, module) {
    var Model = instance.web.Model;

    if (!instance.point_of_sale.PosModel) {
        return;
    }

    module.load_fields('product.product', ['type']);


    var _super_pos = instance.point_of_sale.PosModel.prototype;
    instance.point_of_sale.PosModel = instance.point_of_sale.PosModel.extend({
        initialize: function (session, attributes) {
            this.stock_location_modifier();
            this.pool = [];
            _super_pos.initialize.call(this, session, attributes);
        },
        on_notification: function (notification) {
            var channel = notification[0];
            var message = notification[1];
            if (Array.isArray(channel) && channel[1] === 'pos.stock.channel') {
                this.on_stock_notification(message);
            }
        },
        on_stock_notification: function (stock_quant) {
            var self = this;
            clearTimeout(module.task);

            var product_ids = stock_quant.map(function (item) {
                return item.product_id[0];
            });

            self.pool = _.uniq(self.pool.concat(product_ids));
            module.task = setTimeout(function () {
                $.when(self.qty_sync(self.pool)).done(function () {
                    self.refresh_qty();
                });
            }, 800);
        },
        qty_sync: function (product_ids) {
            var self = this;
            var done = new $.Deferred();
            if (this.config.show_qty_available && this.config.location_only) {
                new Model('stock.quant').call('get_qty_available', [false, self.stock_location_ids, product_ids])
                    .then(function (res) {
                        self.recompute_qty_in_pos_location(product_ids, res);
                        done.resolve();
                    });
            } else if (this.config.show_qty_available) {
                new Model('product.product').call('read', [product_ids, ['qty_available']]).then(function (res) {
                    res.forEach(function (product) {
                        self.db.qty_by_product_id[product.id] = product.qty_available;
                    });
                    done.resolve();
                });
            } else {
                done.resolve();
            }
            return done.promise();
        },
        compute_qty_in_pos_location: function (res) {
            var self = this;
            self.db.qty_by_product_id = {};
            res.forEach(function (item) {
                var product_id = item.product_id[0];
                if (!self.db.qty_by_product_id[product_id]) {
                    self.db.qty_by_product_id[product_id] = item.qty;
                } else {
                    self.db.qty_by_product_id[product_id] += item.qty;
                }
            })
        },
        recompute_qty_in_pos_location: function (product_ids, res) {
            var self = this;
            var res_product_ids = res.map(function (item) {
                return item.product_id[0];
            });

            var out_of_stock_ids = product_ids.filter(function (id) {
                return res_product_ids.indexOf(id) === -1;
            });

            out_of_stock_ids.forEach(function (id) {
                self.db.qty_by_product_id[id] = 0;
            });

            res_product_ids.forEach(function (product_id) {
                self.db.qty_by_product_id[product_id] = false;
            });

            res.forEach(function (item) {
                var product_id = item.product_id[0];

                if (!self.db.qty_by_product_id[product_id]) {
                    self.db.qty_by_product_id[product_id] = item.qty;
                } else {
                    self.db.qty_by_product_id[product_id] += item.qty;
                }
            });
        },
        refresh_qty: function () {
            var self = this;
            var $qty_tag = $('.product-list').find('.qty-tag');
            $qty_tag.each(function () {
                var $product = $(this).parents('.product');
                var id = parseInt($product.attr('data-product-id'));

                var qty = self.db.qty_by_product_id[id];
                if (qty === false) {
                    return;
                }

                if (qty === undefined) {
                    if (self.config.hide_product) {
                        $product.hide();
                        return;
                    } else {
                        qty = 0;
                    }
                }

                var product = self.db.get_product_by_id(id);
                var unit = self.units_by_id[product.uom_id[0]] || {};
                var unit_name = unit.name;
                if (unit_name === 'Unit(s)') {
                    unit_name = ''
                }

                $(this).text(qty + ' ' + unit_name).show('fast');

                if (qty <= self.config.limit_qty) {
                    $(this).addClass('sold-out');
                    if (!self.config.allow_out_of_stock) {
                        $product.addClass('disable');
                    }
                } else {
                    $(this).removeClass('sold-out');
                    $product.removeClass('disable');
                }
            });
        },
        get_model: function (_name) {
            var _index = this.models.map(function (e) {
                return e.model;
            }).indexOf(_name);
            if (_index > -1) {
                return this.models[_index];
            }
            return false;
        },
        load_qty_after_load_product: function () {
            var wait = this.get_model('account.journal');
            var _wait_super_loaded = wait.loaded;
            wait.loaded = function (self, journals) {
                var done = $.Deferred();
                _wait_super_loaded(self, journals);

                var ids = Object.keys(self.db.product_by_id).map(function (item) {
                    return parseInt(item);
                });

                new Model('product.product').call('read', [ids, ['qty_available']]).then(function (res) {
                    self.db.qty_by_product_id = {};
                    res.forEach(function (product) {
                        self.db.qty_by_product_id[product.id] = product.qty_available;
                    });
                    self.refresh_qty();
                    done.resolve();
                });
                return done;
            }
        },
        stock_location_modifier: function () {
            this.stock_location_ids = [];

            var stock_location = this.get_model('stock.location');
            var _super_loaded = stock_location.loaded;

            stock_location.loaded = function (self, locations) {
                var done = new $.Deferred();
                _super_loaded(self, locations);

                if (!self.config.show_qty_available) {
                    return done.resolve();
                }

                if (self.config.allow_out_of_stock) {
                    self.config.limit_qty = 0;
                }

                if (self.config.location_only) {
                    new Model('stock.quant').call('get_qty_available', [self.shop.id]).then(function (res) {
                        self.stock_location_ids = _.uniq(res.map(function (item) {
                            return item.location_id[0];
                        }));
                        self.compute_qty_in_pos_location(res);
                        done.resolve();
                    });
                } else {
                    self.load_qty_after_load_product();
                    done.resolve();
                }
                return done;
            };
        },
        get_product_image_url: function (product) {
            return window.location.origin + '/web/binary/image?model=product.product&field=image_medium&id=' + product.id;
        },
        push_and_invoice_order: function (order) {
            this.sub_qty();
            return _super_pos.push_and_invoice_order.call(this, order);
        },
        push_order: function (order) {
            this.sub_qty();
            return _super_pos.push_order.call(this, order);
        },
        sub_qty: function () {
            var self = this;
            var order = this.get('selectedOrder');
            var orderlines = order.get('orderLines').models;
            var sub_qty_by_product_id = {};
            var ids = [];
            orderlines.forEach(function (line) {
                if (!sub_qty_by_product_id[line.product.id]) {
                    sub_qty_by_product_id[line.product.id] = line.quantity;
                    ids.push(line.product.id);
                } else {
                    sub_qty_by_product_id[line.product.id] += line.quantity;
                }
            });

            ids.forEach(function (id) {
                self.db.qty_by_product_id[id] -= sub_qty_by_product_id[id];
            });
        }
    });

    // refresh qty whenever product is re-rendered
    instance.point_of_sale.ProductListWidget.include({
        render_product: function (product) {
            // for hide qty-tag
            if (this.pos.config.show_qty_available && product.type === 'service') {
                this.pos.db.qty_by_product_id[product.id] = false;
            }
            return this._super(product);
        },
        renderElement: function () {
            this._super();
            var self = this;
            var done = $.Deferred();
            clearInterval(module.task);
            module.task = setTimeout(function () {
                if (self.pos.config.show_qty_available) {
                    self.pos.refresh_qty();
                } else {
                    $(self.el).find('.qty-tag').hide();
                }
                done.resolve();
            }, 100);
            return done;
        }
    });

    // show reminder-popup when out-of-stock
    var _super_orderline = instance.point_of_sale.Orderline.prototype;
    instance.point_of_sale.Orderline = instance.point_of_sale.Orderline.extend({
        set_quantity: function (quantity) {
            _super_orderline.set_quantity.call(this, quantity);

            if (!this.pos.config.show_qty_available
                || this.pos.config.allow_out_of_stock
                || this.product.type === 'service') {
                return;
            }

            this.check_reminder();
        },
        check_reminder: function () {
            var self = this;
            var qty_available = this.pos.db.qty_by_product_id[this.product.id];

            var orderlines = this.order.get('orderLines').models;
            var all_product_line = orderlines.filter(function (orderline) {
                return self.product.id === orderline.product.id;
            });

            if (all_product_line.indexOf(self) === -1) {
                all_product_line.push(self);
            }

            var sum_qty = 0;
            all_product_line.forEach(function (line) {
                sum_qty += line.quantity;
            });

            if (qty_available - sum_qty < this.pos.config.limit_qty) {
                this.pos.pos_widget.screen_selector.show_popup('reminder', {
                    max_available: qty_available - sum_qty + self.quantity - this.pos.config.limit_qty,
                    product_image_url: self.pos.get_product_image_url(self.product),
                    product_name: self.product.display_name,
                    line: self
                });
            }
        }
    });

    instance.point_of_sale.PosWidget.include({
        build_widgets: function () {
            this._super();
            this.bus = openerp.bus.bus;
            this.bus.on('notification', this.pos, this.pos.on_notification);
            this.bus.start_polling();
        }
    });
}