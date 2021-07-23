# -*- encoding: utf-8 -*-
##############################################################################
#    Copyright (c) 2012 - Present Acespritech Solutions Pvt. Ltd. All Rights Reserved
#    Author: <info@acespritech.com>
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    A copy of the GNU General Public License is available at:
#    <http://www.gnu.org/licenses/gpl.html>.
#
##############################################################################
from openerp.osv import fields, osv
from openerp import SUPERUSER_ID
import time
from openerp.tools.translate import _


class member_category(osv.osv):
    _name = "member.category"
    _description = 'Member Category'
    _columns = {
        'code': fields.char('Code', size=32),
        'name': fields.char('Name', size=128),
        'purchase_limit': fields.float('Purchase Limit', help="To earn point, total amount should be greater than this."),
        'enable_redeemtion': fields.boolean('Enable Redeemtion'),
        'point_2_price': fields.float('Point To Price', help="Amount to be considered per point"),
        'price_2_point': fields.float('Price To Point'),
    }
    _defaults = {
        'enable_redeemtion': False,
    }
member_category()


class res_partner(osv.osv):
    _inherit = "res.partner"

    def _total_points(self, cr, uid, ids, name, args, context=None):
        if context is None:
            context = {}
        res = {}
        mp_obj = self.pool.get('member.point')
        for partner in self.browse(cr, uid, ids, context=context):
            total_point = 0 
            mp_ids = mp_obj.search(cr, uid, [('partner_id', '=', partner.id)])
            if mp_ids:
                total_point = sum(map(lambda a: a.point, mp_obj.browse(cr, uid, mp_ids) or []))
            res[partner.id] = total_point
        return res
 
    def _total_redeem_points(self, cr, uid, ids, name, args, context=None):
        if context is None:
            context = {}
        res = {}
        pr_obj = self.pool.get('point.redeem')
        for partner in self.browse(cr, uid, ids, context=context):
            redeem_point = 0 
            pr_ids = pr_obj.search(cr, uid, [('partner_id', '=', partner.id)])
            if pr_ids:
                redeem_point = sum(map(lambda a: a.point, pr_obj.browse(cr, uid, pr_ids) or []))
            res[partner.id] = redeem_point
        return res
 
    def _remain_redeem_points(self, cr, uid, ids, name, args, context=None):
        if context is None:
            context = {}
        res = {}
        for partner in self.browse(cr, uid, ids, context=context):
            res[partner.id] = partner.total_points - partner.total_redeem_points
        return res
 
    def _last_purchase_date(self, cr, uid, ids, name, args, context=None):
        if context is None:
            context = {}
        res = {}
        pos_obj = self.pool.get('pos.order')
        for partner in self.browse(cr, uid, ids, context=context):
            pur_date = False
            pos_ids = pos_obj.search(cr, uid, [('partner_id', '=', partner.id)], 
                                            order='date_order desc', limit=1)
            if pos_ids:
                pos_order = pos_obj.browse(cr, uid, pos_ids[0])
                pur_date = pos_order.date_order or False
            res[partner.id] = pur_date
        return res

    _columns = {
        'member': fields.boolean('Member'),
        'member_cat_id': fields.many2one('member.category', 'Member Category'),
        'membership_date': fields.date('Membership Start Date'),
        'last_purchase_date': fields.function(_last_purchase_date, string="Last Purchase Date", type='date'),
        'total_points': fields.function(_total_points, string="Total Points", type='integer'),
        'total_redeem_points': fields.function(_total_redeem_points, string="Total Redeemed Points", type='integer'),
        'remain_redeem_points': fields.function(_remain_redeem_points, string="Remaining Redeemed Points", type='integer'),
        'member_point_ids': fields.one2many('member.point', 'partner_id', 'Member Points', limit=5),
        'point_redeem_ids': fields.one2many('point.redeem', 'partner_id', 'Point Redemption', limit=5),
    }

    def point_2_price(self, cr, uid, partner_id, redeem_point):
        redeem_point_amt = 0
        if partner_id and redeem_point:
            partner = self.pool.get('res.partner').browse(cr, uid, partner_id)
            if partner.member and partner.member_cat_id:
                redeem_point_amt = round(redeem_point * partner.member_cat_id.point_2_price)
        return redeem_point_amt

res_partner()


class member_point(osv.osv):
    _name = "member.point"
    _description = 'Member Point'
    _columns = {
        'partner_id': fields.many2one('res.partner', 'Member', readonly=1),
        'pos_order_id': fields.many2one('pos.order', 'POS Order', readonly=1),
        'amount_total': fields.float('Total Amount', readonly=1),
        'date': fields.datetime('Date', readonly=1),
        'point': fields.integer('Point', readonly=1),
    }
    _defaults = {
        'date': lambda *a: time.strftime('%Y-%m-%d %H:%M:%S'),
    }
    
member_point()


class point_redeem(osv.osv):
    _name = "point.redeem"
    _description = 'Point Redemption'
    _columns = {
        'partner_id': fields.many2one('res.partner', 'Member', readonly=1),
        'pos_order_id': fields.many2one('pos.order', 'POS Order', readonly=1),
        'amount_total': fields.float('Total Amount', readonly=1),
        'amount_point': fields.float('Point Amount', readonly=1),
        'date': fields.datetime('Date', readonly=1),
        'point': fields.integer('Point', readonly=1),
    }
    _defaults = {
        'date': lambda *a: time.strftime('%Y-%m-%d %H:%M:%S'),
    }
point_redeem()
